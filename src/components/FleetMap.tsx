import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useApp } from '@/lib/store';
import { DEFAULT_COURSE_CENTER, type Cart, type Fence } from '@/lib/telemetry';
import { Layers, Maximize2, Radio } from 'lucide-react';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

const FENCE_SOURCE_ID = 'fences-src';
const FENCE_FILL_LAYER = 'fences-fill';
const FENCE_LINE_LAYER = 'fences-line';

/** Generate a GeoJSON polygon approximating a circle, in degrees. */
function circlePolygon(
  lat: number,
  lng: number,
  radiusM: number,
  steps = 64
): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  const R = 6_371_000;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const dLat = (radiusM / R) * Math.cos(t);
    const dLng = (radiusM / R) * Math.sin(t) / Math.cos((lat * Math.PI) / 180);
    coords.push([lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

function fencesToFeatureCollection(fences: Fence[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fences
      .filter((f) => f.enabled)
      .map((f) => ({
        type: 'Feature',
        geometry: circlePolygon(f.lat, f.lng, f.radius_m),
        properties: {
          idx: f.idx,
          name: f.name,
          radius_m: f.radius_m,
        },
      })),
  };
}

export function FleetMap() {
  const { state, actions, mapRef } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [style, setStyle] = useState<'satellite' | 'streets'>('satellite');

  // Build map once
  useEffect(() => {
    if (!containerRef.current || mapRef?.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style:
        style === 'satellite'
          ? 'mapbox://styles/mapbox/satellite-streets-v12'
          : 'mapbox://styles/mapbox/streets-v12',
      center: [DEFAULT_COURSE_CENTER[1], DEFAULT_COURSE_CENTER[0]],
      zoom: 15,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (e) => {
      const target = e.originalEvent.target as HTMLElement;
      if (!target.closest('.cart-marker-wrapper')) actions.selectCart(null);
    });
    map.on('load', () => {
      map.addSource(FENCE_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: FENCE_FILL_LAYER,
        type: 'fill',
        source: FENCE_SOURCE_ID,
        paint: {
          'fill-color': '#ef4444',
          'fill-opacity': 0.12,
        },
      });
      map.addLayer({
        id: FENCE_LINE_LAYER,
        type: 'line',
        source: FENCE_SOURCE_ID,
        paint: {
          'line-color': '#ef4444',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });
    });
    if (mapRef) mapRef.current = map;
    return () => {
      map.remove();
      if (mapRef) mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Style toggle
  useEffect(() => {
    const map = mapRef?.current;
    if (!map) return;
    map.setStyle(
      style === 'satellite'
        ? 'mapbox://styles/mapbox/satellite-streets-v12'
        : 'mapbox://styles/mapbox/streets-v12'
    );
    map.once('styledata', () => {
      if (map.getSource(FENCE_SOURCE_ID)) return;
      map.addSource(FENCE_SOURCE_ID, {
        type: 'geojson',
        data: fencesToFeatureCollection(state.fences),
      });
      map.addLayer({
        id: FENCE_FILL_LAYER,
        type: 'fill',
        source: FENCE_SOURCE_ID,
        paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: FENCE_LINE_LAYER,
        type: 'line',
        source: FENCE_SOURCE_ID,
        paint: {
          'line-color': '#ef4444',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });
    });
  }, [style]);

  // Push fences into map source on change (retry until source exists)
  useEffect(() => {
    const map = mapRef?.current;
    if (!map) return;
    const data = fencesToFeatureCollection(state.fences);
    const apply = () => {
      const src = map.getSource(FENCE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(data);
    };
    if (map.isStyleLoaded() && map.getSource(FENCE_SOURCE_ID)) {
      apply();
    } else {
      map.once('load', apply);
      map.once('styledata', apply);
    }
  }, [state.fences]);

  // Reconcile markers — create once, only update position + classes on update
  useEffect(() => {
    const map = mapRef?.current;
    if (!map) return;

    const seen = new Set<string>();

    state.carts.forEach((cart) => {
      seen.add(cart.cartId);
      const existing = markersRef.current.get(cart.cartId);
      if (!cart.state || cart.state.lat == null || cart.state.lng == null) {
        // Hide marker if no position yet
        existing?.getElement().classList.add('hidden');
        return;
      }

      const isSelected = state.selectedCartId === cart.cartId;
      const isBypass = cart.state.bypassActive;
      const statusClass =
        cart.state.status === 'INACTIVE' || cart.state.status === 'OFFLINE'
          ? 'inactive'
          : cart.state.status === 'DANGER'
            ? 'danger'
            : '';

      if (existing) {
        existing.setLngLat([cart.state.lng, cart.state.lat]);
        const el = existing.getElement();
        el.classList.remove('hidden');
        const inner = el.querySelector('.cart-marker');
        if (inner) {
          inner.className = `cart-marker ${statusClass} ${isSelected ? 'selected' : ''} ${isBypass ? 'bypass' : ''}`;
        }
      } else {
        const el = document.createElement('div');
        el.className = 'cart-marker-wrapper';
        el.innerHTML = `<div class="cart-marker ${statusClass} ${isSelected ? 'selected' : ''} ${isBypass ? 'bypass' : ''}">
          <span class="mono text-[10px]">${cart.cartId}</span>
        </div>`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          actions.selectCart(cart.cartId);
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([cart.state.lng, cart.state.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 18, closeButton: false, className: 'cart-popup' }).setHTML(
              popupHtml(cart)
            )
          )
          .addTo(map);
        markersRef.current.set(cart.cartId, marker);
      }
    });

    // Drop markers for carts that no longer exist (rare, but for completeness)
    for (const id of Array.from(markersRef.current.keys())) {
      if (!seen.has(id)) {
        markersRef.current.get(id)?.remove();
        markersRef.current.delete(id);
      }
    }
  }, [state.carts, state.selectedCartId]);

  const connectedCount = useMemo(
    () => Array.from(state.carts.values()).filter((c) => c.state?.connected).length,
    [state.carts]
  );

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => actions.centerOnAllCarts()}
          className="glass flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-card transition-colors"
        >
          <Maximize2 size={14} />
          Show All
        </button>
        <button
          onClick={() => setStyle((s) => (s === 'satellite' ? 'streets' : 'satellite'))}
          className="glass flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-card transition-colors"
        >
          <Layers size={14} />
          {style === 'satellite' ? 'Streets' : 'Satellite'}
        </button>
        <div className="glass flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-foreground">
          <Radio size={14} className={state.connection === 'online' ? 'text-accent' : 'text-muted-foreground'} />
          {state.connection === 'online' ? `${connectedCount} live` : state.connection === 'connecting' ? 'connecting' : 'offline'}
        </div>
      </div>
    </div>
  );
}

function popupHtml(cart: Cart): string {
  const s = cart.state;
  const driver = cart.driver?.name ?? 'Unassigned';
  return `<div class="text-xs font-semibold">Cart ${cart.cartId}</div>
          <div class="text-[10px] opacity-80">${driver}</div>
          <div class="text-[10px] mt-1 mono">${s ? `${(s.speedKph ?? 0).toFixed(1)} km/h · ${s.batteryPct ?? 0}% · ${s.status}` : 'no signal'}</div>`;
}
