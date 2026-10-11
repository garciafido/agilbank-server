// No externalValidation projections defined — registry is empty
export type ExternalValidationFieldConfig = {
  name: string;
  type: string;
  label: Record<string, string>;
  readOnly: boolean;
  required: boolean;
  nullable: boolean;
  multilang: boolean;
  enumName?: string;
  options?: { value: string; label: Record<string, string> }[];
  refEntity?: string;
  refPrismaModel?: string;
  refDisplayField?: string;
  refDisplayMultilang?: boolean;
  compositeWith?: string;
  compositeRefField?: string;
  // Metadata de formato para la validación client-side del form público.
  masks?: string[];
  email?: boolean;
  phone?: boolean;
};

export type ExternalValidationGroupConfig = {
  name: string;
  label: Record<string, string>;
  fields: string[];
};

export type ExternalValidationRefLookup = {
  entityName: string;
  prismaModel: string;
  displayField: string;
  displayMultilang: boolean;
  compositeRefField?: string;
  // Los campos que cada fila trae además de id, displayId y parentId, con su
  // nombre: los códigos del catálogo (el code de un país). Sin códigos, no está.
  extraFields?: string[];
  selectFields: Record<string, any>;
};

export type ExternalValidationConfig = {
  projectionName: string;
  prismaModel: string;
  entityName: string;
  emailField: string;
  fields: ExternalValidationFieldConfig[];
  groups: ExternalValidationGroupConfig[];
  selectFields: Record<string, any>;
  editableFields: string[];
  refLookups: ExternalValidationRefLookup[];
  // El campo del registro con el nombre del contacto, para el saludo del mail
  // ("Hola {nombre}"). Lo declara .contactName(campo) en la projection; sin él,
  // el saludo va sin nombre.
  contactNameField?: string;
  // La ruta de la entidad en el cliente: el formulario del registro es
  // /<entityRoute>/view/<id>. Una entidad .avoidForAPI no tiene ruta en el
  // cliente: ahí no lleva a ningún formulario.
  entityRoute: string;
  // El nombre visible del registro (el mismo que arma el cliente) y lo que hay
  // que leer para armarlo: lo usa el aviso a los administradores. displayNameSelect
  // sirve solo como el select de la consulta, sin otras claves, y nunca está vacío
  // (Prisma rechaza un select vacío): una entidad .avoidForAPI, sin nombre visible,
  // lee el id.
  displayNameSelect: Record<string, any>;
  // Un texto: si el nombre depende del idioma, el del idioma por defecto del proyecto.
  displayName: (row: any) => string;
  // Servicio de update de la entidad (clase inyectable) + su método, para que el
  // submit público corra por la MISMA pila de validación que el guardado normal.
  updateService: new (...args: any[]) => any;
  updateMethod: string;
};

export const externalValidationRegistry: Record<
  string,
  ExternalValidationConfig
> = {};
