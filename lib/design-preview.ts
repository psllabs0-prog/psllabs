/** Preview isolation is controlled by the deployment environment, never by a visitor. */
export function isDesignPreview(): boolean {
  return process.env.PSL_VISUAL_PREVIEW === "1";
}
