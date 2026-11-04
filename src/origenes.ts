// Sites allowed to hand grades to the extension. The local Aula Manager is only in a
// development build (DESARROLLO=1 npm run armar): in the published one, any program
// on that port could load fake grades, and over plain HTTP.
declare const __DESARROLLO__: boolean;

export const ORIGEN_DE_PRODUCCION = "https://aula-manager.com";
export const ORIGEN_DE_DESARROLLO = "http://localhost:8000";
export const ORIGENES_DE_AULA_MANAGER = __DESARROLLO__ ? [ORIGEN_DE_PRODUCCION, ORIGEN_DE_DESARROLLO] : [ORIGEN_DE_PRODUCCION];
