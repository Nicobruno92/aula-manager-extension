#!/usr/bin/env bash
# Regenerate the extension's PNG icons from the SVGs in diseno/ (needs rsvg-convert).
#
# diseno/icono.svg is Aula Manager's favicon (static/img/favicon.svg in aula_manager).
# diseno/icono-chico.svg is the same drawing with thicker strokes: at 16 and 32 px the
# thin «A» blurs into the background. The 128 px icon follows the Chrome Web Store
# guideline: 96×96 artwork centered on a transparent 128×128 canvas.
set -euo pipefail

FUENTES=diseno
SALIDA=estatico/iconos
LIENZO_GRANDE=128
DIBUJO_GRANDE=96
MARGEN_GRANDE=$(( (LIENZO_GRANDE - DIBUJO_GRANDE) / 2 ))

mkdir -p "$SALIDA"
for tamano in 16 32; do
  rsvg-convert -w "$tamano" -h "$tamano" "$FUENTES/icono-chico.svg" -o "$SALIDA/icono-$tamano.png"
done
rsvg-convert -w 48 -h 48 "$FUENTES/icono.svg" -o "$SALIDA/icono-48.png"
rsvg-convert -w "$DIBUJO_GRANDE" -h "$DIBUJO_GRANDE" \
  --page-width "$LIENZO_GRANDE" --page-height "$LIENZO_GRANDE" --left "$MARGEN_GRANDE" --top "$MARGEN_GRANDE" \
  "$FUENTES/icono.svg" -o "$SALIDA/icono-128.png"
echo "Íconos en $SALIDA/"
