/**
 * Validates that latitude and longitude values are within valid geographic ranges.
 * @param lat Latitude (-90 to 90)
 * @param lon Longitude (-180 to 180)
 * @returns true if coordinates are valid
 */
export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Validates a search query for external API calls.
 * @param query The search query string
 * @param maxLength Maximum allowed length (default: 200)
 * @returns true if query is valid
 */
export function isValidSearchQuery(query: string, maxLength: number = 200): boolean {
  return query.length > 0 && query.length <= maxLength;
}
