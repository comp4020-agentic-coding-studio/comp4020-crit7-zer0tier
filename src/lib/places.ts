// Where each real class is, from ANU's own campus map (www.anu.edu.au/maps),
// read 23 Sep 2026: each page's embedded lat/long and building_number. The
// room-level pages exist for four of the six rooms; Fulton Muir 2.02 and
// 2.03 have none, so they link to the building page.
export interface Place {
  building: string;
  number: string;
  lat: number;
  lng: number;
  mapUrl: string; // ANU campus map, room page where ANU has one
}

const ANU = "https://www.anu.edu.au/maps";

const BUILDINGS: Record<string, Omit<Place, "mapUrl"> & { mapUrl: string }> = {
  "153": { building: "Lowitja O’Donoghue Cultural Centre", number: "153", lat: -35.276928, lng: 149.121926, mapUrl: `${ANU}/kambri-precinct/lowitja-odonoghue-cultural-centre` },
  "155": { building: "Marie Reay Teaching Centre", number: "155", lat: -35.277786, lng: 149.120685, mapUrl: `${ANU}/kambri-precinct/marie-reay-teaching-centre` },
  "95": { building: "Fulton Muir Building", number: "95", lat: -35.273661, lng: 149.120763, mapUrl: `${ANU}/fulton-muir-building` },
  "24": { building: "Copland Building", number: "24", lat: -35.277985, lng: 149.123419, mapUrl: `${ANU}/copland-building` },
};

// ANU room pages, keyed by the room part of MyTT's location ("Rm 4.03").
const ROOMS: Record<string, string> = {
  "153|Manning Clark Hall Rm 1.04": `${ANU}/lowitja-odonoghue-cultural-centre/cultural-centre-manning-clark-hall-104`,
  "153|Cinema Rm 1.02": `${ANU}/lowitja-odonoghue-cultural-centre/cultural-centre-cinema-102`,
  "155|Rm 4.03": `${ANU}/marie-reay-teaching-centre/marie-reay-403`,
  "24|Rm G39": `${ANU}/copland-building/copland-g39`,
};

/** The place for a MyTT location ("Rm G39_Copland Bldg 24"), or null if unknown. */
export function placeFor(location: string): Place | null {
  const [room, rest] = location.split("_");
  const number = rest?.match(/Bldg (\w+)/)?.[1];
  const b = number ? BUILDINGS[number] : undefined;
  if (!b) return null;
  return { ...b, mapUrl: ROOMS[`${number}|${room}`] ?? b.mapUrl };
}

/** An OpenStreetMap embed centred on the place, with a marker. No key, no tracking script. */
export function osmEmbedUrl(p: Place, span = 0.0025): string {
  const bbox = [p.lng - span, p.lat - span / 1.6, p.lng + span, p.lat + span / 1.6].map((n) => n.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat},${p.lng}`;
}

/** Walking directions in Google Maps (its documented URL API; no key). */
export function directionsUrl(p: Place): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
}
