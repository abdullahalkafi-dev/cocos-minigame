// Shapes shared by every game definition: fields, groups and the GameDef itself.
export type FieldType = 'text' | 'longtext' | 'textlist' | 'number' | 'color' | 'asset' | 'numberlist' | 'select' | 'toggle' | 'list';
export type AssetKind = 'image' | 'video' | 'audio' | 'media';
export interface Field {
  key: string; label: string; type: FieldType; help?: string;
  min?: number; max?: number; step?: number; unit?: string; options?: string[];
  itemFields?: Field[]; minItems?: number; maxItems?: number; itemLabel?: string;
  kind?: AssetKind; hint?: string;            // asset fields: what is accepted, recommended size
  readonlyInList?: boolean;                    // list item field that is an identifier
}
export interface Group { id: string; title: string; description?: string; fields: Field[] }
export interface GameDef {
  slug: string; name: string; tagline: string; price: number; tech: string[];
  defaults: Record<string, any>; manifest: Group[];
  validate?: (cfg: any) => string | null;
}
