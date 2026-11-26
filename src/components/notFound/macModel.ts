export const MAC_MODEL_URL = '/assets/models/macintosh.glb';

export const ROOM_LIGHT = '--gl-404-light';

let model: Promise<ArrayBuffer> | null = null;

export function loadMacModel(): Promise<ArrayBuffer> {
  model ??= fetch(MAC_MODEL_URL).then(response => {
    if (!response.ok) throw new Error(`mac model ${response.status}`);
    return response.arrayBuffer();
  });
  return model;
}
