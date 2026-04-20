import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useApp } from '@/lib/store';
import { api } from '@/lib/api';
import { DEFAULT_COURSE_CENTER, type Fence } from '@/lib/telemetry';
import { Plus, Trash2, Save, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

function circle(lat: number, lng: number, r: number, steps = 64): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  const R = 6_371_000;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const dLat = (r / R) * Math.cos(t);
    const dLng = (r / R) * Math.sin(t) / Math.cos((lat * Math.PI) / 180);
    coords.push([lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

export default function FencesPage() {
  const { state, actions } = useApp();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [draft, setDraft] = useState<{ lat: number; lng: number; radius: number; name: string } | null>(null);
  const [selected, setSelected] = useState<Fence | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [DEFAULT_COURSE_CENTER[1], DEFAULT_COURSE_CENTER[0]],
      zoom: 16,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (e) => {
      setDraft((d) => ({
        lat: e.lngLat.lat,
        lng: e.lngLat.lng,
        radius: d?.radius ?? 100,
        name: d?.name ?? 'New Fence',
      }));
    });
    map.on('load', () => {
      map.addSource('fences', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'fences-fill',
        type: 'fill',
        source: 'fences',
        paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.15 },
      });
      map.addLayer({
        id: 'fences-line',
        type: 'line',
        source: 'fences',
        paint: { 'line-color': '#ef4444', 'line-width': 2 },
      });
      map.addSource('draft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'draft-fill',
        type: 'fill',
        source: 'draft',
        paint: { 'fill-color': '#10b981', 'fill-opacity': 0.2 },
      });
      map.addLayer({
        id: 'draft-line',
        type: 'line',
        source: 'draft',
        paint: { 'line-color': '#10b981', 'line-width': 2, 'line-dasharray': [2, 2] },
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update fences layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('fences') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: state.fences.map((f) => ({
        type: 'Feature',
        geometry: circle(f.lat, f.lng, f.radius_m),
        properties: { idx: f.idx, name: f.name },
      })),
    });
  }, [state.fences]);

  // Update draft layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource('draft') as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: 'FeatureCollection',
        features: draft
          ? [{ type: 'Feature', geometry: circle(draft.lat, draft.lng, draft.radius), properties: {} }]
          : [],
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [draft]);

  async function saveDraft(): Promise<void> {
    if (!draft) return;
    try {
      const fence = await api.createFence({
        name: draft.name,
        lat: draft.lat,
        lng: draft.lng,
        radiusM: draft.radius,
        flag: 2,
        enabled: true,
      });
      actions.setFences([...state.fences.filter((f) => f.idx !== fence.idx), fence]);
      setDraft(null);
    } catch (e) {
      alert('Failed to save: ' + (e as Error).message);
    }
  }

  async function updateRadius(fence: Fence, radius: number): Promise<void> {
    try {
      const updated = await api.updateFence(fence.idx, { radiusM: radius });
      actions.setFences(state.fences.map((f) => (f.idx === fence.idx ? updated : f)));
    } catch (e) {
      alert('Failed to update: ' + (e as Error).message);
    }
  }

  async function deleteFence(fence: Fence): Promise<void> {
    if (!confirm(`Delete fence "${fence.name}"? All trackers will stop alarming on this zone.`)) return;
    try {
      await api.deleteFence(fence.idx);
      actions.setFences(state.fences.filter((f) => f.idx !== fence.idx));
      if (selected?.idx === fence.idx) setSelected(null);
    } catch (e) {
      alert('Failed to delete: ' + (e as Error).message);
    }
  }

  return (
    <div className="h-[calc(100vh-56px)] flex">
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-4 right-4 md:right-auto glass rounded-xl px-4 py-3 max-w-md"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield size={16} className="text-accent" />
            <span>Tap the map to place a new fence. Adjust radius in the panel.</span>
          </div>
        </motion.div>
      </div>

      <aside className="w-[340px] h-full glass-dark border-l border-primary-foreground/10 p-4 overflow-y-auto text-primary-foreground">
        <h2 className="text-lg font-bold mb-3">Geofences</h2>

        {draft && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-accent/10 border border-accent/30 rounded-xl p-3 mb-4"
          >
            <p className="text-xs uppercase text-accent mb-2 font-semibold">New fence draft</p>
            <label className="block mb-2">
              <span className="text-xs text-primary-foreground/70">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="mt-1 w-full bg-white/10 rounded-lg px-2 py-1.5 text-sm text-white border border-white/10"
              />
            </label>
            <label className="block mb-2">
              <span className="text-xs text-primary-foreground/70 flex justify-between">
                Radius (m) <span className="font-mono">{draft.radius}</span>
              </span>
              <input
                type="range"
                min={10}
                max={1000}
                step={5}
                value={draft.radius}
                onChange={(e) => setDraft({ ...draft, radius: parseInt(e.target.value, 10) })}
                className="w-full accent-accent"
              />
            </label>
            <div className="text-[10px] font-mono text-primary-foreground/60 mb-2">
              {draft.lat.toFixed(6)}, {draft.lng.toFixed(6)}
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveDraft}
                className="flex-1 flex items-center justify-center gap-1.5 bg-accent text-accent-foreground rounded-lg py-2 text-sm font-medium"
              >
                <Save size={14} /> Save
              </button>
              <button onClick={() => setDraft(null)} className="px-3 bg-white/10 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        <div className="flex flex-col gap-2">
          {state.fences.length === 0 && !draft && (
            <p className="text-xs text-primary-foreground/50">No fences yet. Tap the map.</p>
          )}
          {state.fences
            .slice()
            .sort((a, b) => a.idx - b.idx)
            .map((f) => (
              <motion.div
                key={f.idx}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selected?.idx === f.idx
                    ? 'bg-white/10 border-accent'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                onClick={() => {
                  setSelected(f);
                  mapRef.current?.flyTo({ center: [f.lng, f.lat], zoom: 17 });
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{f.name}</p>
                    <p className="text-[10px] font-mono text-primary-foreground/50">
                      #{f.idx} · {Math.round(f.radius_m)}m · flag {f.flag}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFence(f);
                    }}
                    className="p-1.5 rounded-md text-danger/90 hover:bg-danger/10"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {selected?.idx === f.idx && (
                  <div className="mt-3">
                    <label className="block">
                      <span className="text-[10px] text-primary-foreground/60 flex justify-between">
                        Radius <span className="font-mono">{f.radius_m}</span>
                      </span>
                      <input
                        type="range"
                        min={10}
                        max={1000}
                        step={5}
                        value={f.radius_m}
                        onChange={(e) =>
                          updateRadius(f, parseInt(e.target.value, 10))
                        }
                        className="w-full accent-accent"
                      />
                    </label>
                  </div>
                )}
              </motion.div>
            ))}
        </div>

        <div className="mt-5 text-[11px] text-primary-foreground/50 p-3 rounded-lg bg-white/5">
          <p className="font-semibold mb-1 flex items-center gap-1">
            <Plus size={11} /> Hardware sync
          </p>
          <p>
            Saving pushes 125/126/212/251 commands to every connected VT-100 so the cart's on-device fence
            matches the server.
          </p>
        </div>
      </aside>
    </div>
  );
}
