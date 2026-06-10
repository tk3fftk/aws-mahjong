import type { Tile, TileId } from "../types";
import { AWS_NAMES, tileImageUrl } from "../tiles";

export interface RenderTileOpts {
  variant?: "hand" | "discard" | "back";
  draggable?: boolean;
  clickable?: boolean;
  extraClass?: string;
  index?: number;
  highlight?: boolean;
  selected?: boolean;
}

export function renderTile(tile: Tile, opts: RenderTileOpts = {}): string {
  if (opts.variant === "back") {
    return `<div class="tile back ${opts.extraClass ?? ""}"></div>`;
  }
  return tileImg(tile.id, opts);
}

export function renderTileById(id: TileId, opts: RenderTileOpts = {}): string {
  return tileImg(id, opts);
}

function tileImg(id: TileId, opts: RenderTileOpts): string {
  const classes = ["tile"];
  if (opts.variant) classes.push(opts.variant);
  if (opts.clickable) classes.push("clickable");
  if (opts.draggable) classes.push("draggable");
  if (opts.selected) classes.push("selected");
  if (opts.highlight) classes.push("draw-highlight");
  if (opts.extraClass) classes.push(opts.extraClass);
  const dataIndex = opts.index !== undefined ? `data-index="${opts.index}"` : "";
  const draggableAttr = opts.draggable ? `draggable="true"` : "";
  return `<span class="${classes.join(" ")}" ${dataIndex} ${draggableAttr} title="${AWS_NAMES[id]}">
    <img src="${tileImageUrl(id)}" alt="${AWS_NAMES[id]}">
  </span>`;
}
