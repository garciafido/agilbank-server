/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * EL CORPUS DE MATU — AUTOGENERADO por bakeCorpus.ts. No editar a mano.
 * Regenerar: npm run build && node build/haiku/design/matu/bakeCorpus.js
 * Fuente: docs/UI/design-tokens-matu/
 *
 * Es el export de Tokens Studio tal cual, como dato puro: sin `fs`, así
 * ensamblar cualquiera de sus combinaciones corre en generación y en el
 * navegador con la misma función.
 */

import { Corpus } from "./matuAssemble";

export const MATU_CORPUS: Corpus = {
  manifest: {
    name: "Design Tokens",
    collections: {
      "Color Contrast": {
        modes: {
          "Canvas High": ["Color Contrast.Canvas High.tokens.json"],
          "Canvas Low": ["Color Contrast.Canvas Low.tokens.json"],
          "Mantle High": ["Color Contrast.Mantle High.tokens.json"],
          "Mantle Low": ["Color Contrast.Mantle Low.tokens.json"],
          Solid: ["Color Contrast.Solid.tokens.json"],
          Highest: ["Color Contrast.Highest.tokens.json"],
        },
      },
      Tokens: { modes: { "Mode 1": ["Tokens.Mode 1.tokens.json"] } },
      "Color Scheme": {
        modes: {
          "Blue Cated": ["Color Scheme.Blue Cated.tokens.json"],
          "Red Roel": ["Color Scheme.Red Roel.tokens.json"],
          Yellow: ["Color Scheme.Yellow.tokens.json"],
          Green: ["Color Scheme.Green.tokens.json"],
          Neutral: ["Color Scheme.Neutral.tokens.json"],
          Info: ["Color Scheme.Info.tokens.json"],
          Success: ["Color Scheme.Success.tokens.json"],
          Warning: ["Color Scheme.Warning.tokens.json"],
          Error: ["Color Scheme.Error.tokens.json"],
          "Blue Uchi": ["Color Scheme.Blue Uchi.tokens.json"],
        },
      },
      "Color Mode": {
        modes: {
          Light: ["Color Mode.Light.tokens.json"],
          Dark: ["Color Mode.Dark.tokens.json"],
        },
      },
      Themes: {
        modes: {
          Uchi: ["Themes.Uchi.tokens.json"],
          Cated: ["Themes.Cated.tokens.json"],
          Human: ["Themes.Human.tokens.json"],
          Tech: ["Themes.Tech.tokens.json"],
          Culture: ["Themes.Culture.tokens.json"],
        },
      },
    },
    styles: { effect: ["effect.styles.tokens.json"] },
  },
  files: {
    "Color Contrast.Canvas High.tokens.json": {
      Canvas: { $type: "color", $value: "{Base}" },
      Content: { $type: "color", $value: "{Contrast}" },
      Main: { $type: "color", $value: "{Vivid}" },
      On_Main: { $type: "color", $value: "{Light}" },
      Surface: { $type: "color", $value: "{Tint}" },
      On_Surface: { $type: "color", $value: "{Strong}" },
      Mantle: { $type: "color", $value: "{Wash}" },
      Border: { $type: "color", $value: "{Medium}" },
      Content_Low: { $type: "color", $value: "{Strong}" },
      Focus: { $type: "color", $value: "{Relation_Colors.Focus_Vivid}" },
      "1_level": { $type: "boolean", $value: true },
      "2__level": { $type: "boolean", $value: true },
      "3_level": { $type: "boolean", $value: true },
      "4_level": { $type: "boolean", $value: true },
      "5_level": { $type: "boolean", $value: true },
    },
    "Color Contrast.Canvas Low.tokens.json": {
      Canvas: { $type: "color", $value: "{Base}" },
      Content: { $type: "color", $value: "{Vivid}" },
      Main: { $type: "color", $value: "{Vivid}" },
      On_Main: { $type: "color", $value: "{Light}" },
      Surface: { $type: "color", $value: "{Tint}" },
      On_Surface: { $type: "color", $value: "{Strong}" },
      Mantle: { $type: "color", $value: "{Wash}" },
      Border: { $type: "color", $value: "{Medium}" },
      Content_Low: { $type: "color", $value: "{Vivid}" },
      Focus: { $type: "color", $value: "{Relation_Colors.Focus_Vivid}" },
      "1_level": { $type: "boolean", $value: true },
      "2__level": { $type: "boolean", $value: true },
      "3_level": { $type: "boolean", $value: true },
      "4_level": { $type: "boolean", $value: true },
      "5_level": { $type: "boolean", $value: true },
    },
    "Color Contrast.Mantle High.tokens.json": {
      Canvas: { $type: "color", $value: "{Wash}" },
      Content: { $type: "color", $value: "{Contrast}" },
      Main: { $type: "color", $value: "{Vivid}" },
      On_Main: { $type: "color", $value: "{Light}" },
      Surface: { $type: "color", $value: "{Tint}" },
      On_Surface: { $type: "color", $value: "{Contrast}" },
      Mantle: { $type: "color", $value: "{Base}" },
      Border: { $type: "color", $value: "{Medium}" },
      Content_Low: { $type: "color", $value: "{Strong}" },
      Focus: { $type: "color", $value: "{Relation_Colors.Focus_Vivid}" },
      "1_level": { $type: "boolean", $value: true },
      "2__level": { $type: "boolean", $value: true },
      "3_level": { $type: "boolean", $value: true },
      "4_level": { $type: "boolean", $value: true },
      "5_level": { $type: "boolean", $value: true },
    },
    "Color Contrast.Mantle Low.tokens.json": {
      Canvas: { $type: "color", $value: "{Wash}" },
      Content: { $type: "color", $value: "{Vivid}" },
      Main: { $type: "color", $value: "{Vivid}" },
      On_Main: { $type: "color", $value: "{Light}" },
      Surface: { $type: "color", $value: "{Tint}" },
      On_Surface: { $type: "color", $value: "{Strong}" },
      Mantle: { $type: "color", $value: "{Base}" },
      Border: { $type: "color", $value: "{Medium}" },
      Content_Low: { $type: "color", $value: "{Vivid}" },
      Focus: { $type: "color", $value: "{Relation_Colors.Focus_Vivid}" },
      "1_level": { $type: "boolean", $value: true },
      "2__level": { $type: "boolean", $value: true },
      "3_level": { $type: "boolean", $value: true },
      "4_level": { $type: "boolean", $value: true },
      "5_level": { $type: "boolean", $value: true },
    },
    "Color Contrast.Solid.tokens.json": {
      Canvas: { $type: "color", $value: "{Vivid}" },
      Content: { $type: "color", $value: "{Light}" },
      Main: { $type: "color", $value: "{Tint}" },
      On_Main: { $type: "color", $value: "{Vivid_Darker}" },
      Surface: { $type: "color", $value: "{Vivid_Darkest}" },
      On_Surface: { $type: "color", $value: "{Light}" },
      Mantle: { $type: "color", $value: "{Strong}" },
      Border: { $type: "color", $value: "{Light}" },
      Content_Low: { $type: "color", $value: "{Light}" },
      Focus: { $type: "color", $value: "{Relation_Colors.Focus_Contrast}" },
      "1_level": { $type: "boolean", $value: true },
      "2__level": { $type: "boolean", $value: true },
      "3_level": { $type: "boolean", $value: true },
      "4_level": { $type: "boolean", $value: true },
      "5_level": { $type: "boolean", $value: true },
    },
    "Color Contrast.Highest.tokens.json": {
      Canvas: { $type: "color", $value: "{Base}" },
      Content: { $type: "color", $value: "{Contrast}" },
      Main: { $type: "color", $value: "{Contrast}" },
      On_Main: { $type: "color", $value: "{Base}" },
      Surface: { $type: "color", $value: "{Contrast}" },
      On_Surface: { $type: "color", $value: "{Base}" },
      Mantle: { $type: "color", $value: "{Base}" },
      Border: { $type: "color", $value: "{Contrast}" },
      Content_Low: { $type: "color", $value: "{Contrast}" },
      Focus: { $type: "color", $value: "{Relation_Colors.Focus_Contrast}" },
      "1_level": { $type: "boolean", $value: true },
      "2__level": { $type: "boolean", $value: true },
      "3_level": { $type: "boolean", $value: true },
      "4_level": { $type: "boolean", $value: true },
      "5_level": { $type: "boolean", $value: true },
    },
    "Tokens.Mode 1.tokens.json": {
      Radius_Tokens: {
        Radius_None: { $type: "dimension", $value: "0px" },
        Radius_XS: { $type: "dimension", $value: "2px" },
        Radius_S: { $type: "dimension", $value: "4px" },
        Radius_M: { $type: "dimension", $value: "8px" },
        Radius_L: { $type: "dimension", $value: "12px" },
        Radius_XL: { $type: "dimension", $value: "16px" },
        Radius_Full: { $type: "dimension", $value: "999px" },
      },
      Spacing_Tokens: {
        "s-2": { $type: "dimension", $value: "2px" },
        "s-4": { $type: "dimension", $value: "4px" },
        "s-8": { $type: "dimension", $value: "8px" },
        "s-12": { $type: "dimension", $value: "12px" },
        "s-16": { $type: "dimension", $value: "16px" },
        "s-20": { $type: "dimension", $value: "20px" },
        "s-24": { $type: "dimension", $value: "24px" },
        "s-28": { $type: "dimension", $value: "28px" },
        "s-32": { $type: "dimension", $value: "32px" },
        "s-36": { $type: "dimension", $value: "36px" },
        "s-40": { $type: "dimension", $value: "40px" },
        "s-44": { $type: "dimension", $value: "44px" },
        "s-48": { $type: "dimension", $value: "48px" },
        "s-56": { $type: "dimension", $value: "56px" },
        "s-64": { $type: "dimension", $value: "64px" },
        "s-72": { $type: "dimension", $value: "72px" },
        "s-80": { $type: "dimension", $value: "80px" },
        "s-96": { $type: "dimension", $value: "96px" },
        "s-128": { $type: "dimension", $value: "128px" },
        "s-160": { $type: "dimension", $value: "160px" },
        "s-192": { $type: "dimension", $value: "192px" },
        "s-224": { $type: "dimension", $value: "224px" },
        "s-256": { $type: "dimension", $value: "256px" },
        "s-320": { $type: "dimension", $value: "0px" },
      },
      Line_Height_Tokens: {
        "line-height-90": { $type: "dimension", $value: "90px" },
        "line-height-100": { $type: "dimension", $value: "100px" },
        "line-height-120": { $type: "dimension", $value: "120px" },
        "line-height-130": { $type: "dimension", $value: "130px" },
        "line-height-150": { $type: "dimension", $value: "150px" },
        "line-height-170": { $type: "dimension", $value: "170px" },
      },
      Font_Size_Tokens: {
        "text-11": { $type: "dimension", $value: "11px" },
        "text-12": { $type: "dimension", $value: "12px" },
        "text-14": { $type: "dimension", $value: "14px" },
        "text-16": { $type: "dimension", $value: "16px" },
        "text-18": { $type: "dimension", $value: "18px" },
        "text-20": { $type: "dimension", $value: "20px" },
        "text-24": { $type: "dimension", $value: "24px" },
        "text-28": { $type: "dimension", $value: "28px" },
        "text-32": { $type: "dimension", $value: "32px" },
        "text-36": { $type: "dimension", $value: "36px" },
        "text-40": { $type: "dimension", $value: "40px" },
        "text-44": { $type: "dimension", $value: "44px" },
        "text-48": { $type: "dimension", $value: "48px" },
        "text-56": { $type: "dimension", $value: "56px" },
        "text-64": { $type: "dimension", $value: "64px" },
        "text-72": { $type: "dimension", $value: "72px" },
        "text-80": { $type: "dimension", $value: "80px" },
        "text-96": { $type: "dimension", $value: "96px" },
      },
      Opacity_Tokens: {
        Base: {
          "opacity-10": { $type: "dimension", $value: "10" },
          "opacity-20": { $type: "dimension", $value: "20" },
          "opacity-30": { $type: "dimension", $value: "30" },
          "opacity-40": { $type: "dimension", $value: "40" },
          "opacity-50": { $type: "dimension", $value: "50" },
          "opacity-60": { $type: "dimension", $value: "60" },
          "opacity-70": { $type: "dimension", $value: "70" },
          "opacity-80": { $type: "dimension", $value: "80" },
          "opacity-90": { $type: "dimension", $value: "90" },
        },
        States: {
          Hover_Opacity: { $type: "dimension", $value: "25" },
          Selected_Opacity: { $type: "dimension", $value: "35" },
          Active_Opacity: { $type: "dimension", $value: "45" },
          Disable_Opacity: { $type: "dimension", $value: "30" },
        },
      },
      Font_Weight_Tokens: {
        "font-weight-100": { $type: "dimension", $value: "100" },
        "font-weight-200": { $type: "dimension", $value: "200" },
        "font-weight-300": { $type: "dimension", $value: "300" },
        "font-weight-400": { $type: "dimension", $value: "400" },
        "font-weight-500": { $type: "dimension", $value: "500" },
        "font-weight-600": { $type: "dimension", $value: "600" },
        "font-weight-700": { $type: "dimension", $value: "700" },
        "font-weight-800": { $type: "dimension", $value: "800" },
        "font-weight-900": { $type: "dimension", $value: "900" },
      },
    },
    "Color Scheme.Blue Cated.tokens.json": {
      Base_Colors: {
        Color_0: { $type: "color", $value: "#ffffff" },
        Color_50: { $type: "color", $value: "#e8f3ff" },
        Color_100: { $type: "color", $value: "#c4e1ff" },
        Color_200: { $type: "color", $value: "#93c8ff" },
        Color_300: { $type: "color", $value: "#62afff" },
        Color_400: { $type: "color", $value: "#3296fe" },
        Color_500: { $type: "color", $value: "#0173ea" },
        Color_600: { $type: "color", $value: "#0158b2" },
        Color_700: { $type: "color", $value: "#004d9d" },
        Color_800: { $type: "color", $value: "#00356c" },
        Color_900: { $type: "color", $value: "#001d3b" },
        Color_950: { $type: "color", $value: "#001123" },
        Color_1000: { $type: "color", $value: "#00070d" },
      },
      Relation_Colors: {
        Color_Focus_100: { $type: "color", $value: "#f8e059" },
        Color_Focus_500: { $type: "color", $value: "#8f7a03" },
        "Color_hue-30-100": { $type: "color", $value: "#ddfef9" },
        "Color_hue-30-500": { $type: "color", $value: "#0cd0a3" },
        "Color_hue-30-900": { $type: "color", $value: "#014838" },
        "Color_hue-330-100": { $type: "color", $value: "#ddccff" },
        "Color_hue-330-500": { $type: "color", $value: "#4d0cd0" },
        "Color_hue-330-900": { $type: "color", $value: "#3e178b" },
      },
    },
    "Color Scheme.Red Roel.tokens.json": {
      Base_Colors: {
        Color_0: { $type: "color", $value: "#ffffff" },
        Color_50: { $type: "color", $value: "#ffedee" },
        Color_100: { $type: "color", $value: "#f8cacb" },
        Color_200: { $type: "color", $value: "#f49e9f" },
        Color_300: { $type: "color", $value: "#f07173" },
        Color_400: { $type: "color", $value: "#ec4447" },
        Color_500: { $type: "color", $value: "#e8171a" },
        Color_600: { $type: "color", $value: "#bb1316" },
        Color_700: { $type: "color", $value: "#8e0f11" },
        Color_800: { $type: "color", $value: "#610b0c" },
        Color_900: { $type: "color", $value: "#350708" },
        Color_950: { $type: "color", $value: "#1f0404" },
        Color_1000: { $type: "color", $value: "#120101" },
      },
      Relation_Colors: {
        Color_Focus_100: { $type: "color", $value: "#f8e059" },
        Color_Focus_500: { $type: "color", $value: "#8f7a03" },
        "Color_hue-30-100": { $type: "color", $value: "#f0c9ff" },
        "Color_hue-30-500": { $type: "color", $value: "#bf4aed" },
        "Color_hue-30-900": { $type: "color", $value: "#3e0056" },
        "Color_hue-330-100": { $type: "color", $value: "#ffd6c9" },
        "Color_hue-330-500": { $type: "color", $value: "#ed704a" },
        "Color_hue-330-900": { $type: "color", $value: "#561400" },
      },
    },
    "Color Scheme.Yellow.tokens.json": {
      Base_Colors: {
        Color_0: { $type: "color", $value: "#ffffff" },
        Color_50: { $type: "color", $value: "#fffef4" },
        Color_100: { $type: "color", $value: "#fffada" },
        Color_200: { $type: "color", $value: "#f8e059" },
        Color_300: { $type: "color", $value: "#dfc220" },
        Color_400: { $type: "color", $value: "#d2b61a" },
        Color_500: { $type: "color", $value: "#ba9f04" },
        Color_600: { $type: "color", $value: "#726100" },
        Color_700: { $type: "color", $value: "#493f00" },
        Color_800: { $type: "color", $value: "#2e2800" },
        Color_900: { $type: "color", $value: "#1f1b00" },
        Color_950: { $type: "color", $value: "#1d1b01" },
        Color_1000: { $type: "color", $value: "#0b0a00" },
      },
      Relation_Colors: {
        Color_Focus_100: { $type: "color", $value: "#a2d0ff" },
        Color_Focus_500: { $type: "color", $value: "#0055ac" },
        "Color_hue-30-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-900": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-900": { $type: "color", $value: "#ffffff" },
      },
    },
    "Color Scheme.Green.tokens.json": {
      Base_Colors: {
        Color_0: { $type: "color", $value: "#ffffff" },
        Color_50: { $type: "color", $value: "#eeffff" },
        Color_100: { $type: "color", $value: "#dbffff" },
        Color_200: { $type: "color", $value: "#aeffff" },
        Color_300: { $type: "color", $value: "#6be8e8" },
        Color_400: { $type: "color", $value: "#0bbcbc" },
        Color_500: { $type: "color", $value: "#008b8b" },
        Color_600: { $type: "color", $value: "#027373" },
        Color_700: { $type: "color", $value: "#005555" },
        Color_800: { $type: "color", $value: "#003838" },
        Color_900: { $type: "color", $value: "#002020" },
        Color_950: { $type: "color", $value: "#012020" },
        Color_1000: { $type: "color", $value: "#000d0d" },
      },
      Relation_Colors: {
        Color_Focus_100: { $type: "color", $value: "#f8e059" },
        Color_Focus_500: { $type: "color", $value: "#8f7a03" },
        "Color_hue-30-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-900": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-900": { $type: "color", $value: "#ffffff" },
      },
    },
    "Color Scheme.Neutral.tokens.json": {
      Base_Colors: {
        Color_0: { $type: "color", $value: "#ffffff" },
        Color_50: { $type: "color", $value: "#fafafa" },
        Color_100: { $type: "color", $value: "#e7e7e7" },
        Color_200: { $type: "color", $value: "#e2e8f0" },
        Color_300: { $type: "color", $value: "#cbd5e1" },
        Color_400: { $type: "color", $value: "#94a3b8" },
        Color_500: { $type: "color", $value: "#64748b" },
        Color_600: { $type: "color", $value: "#475569" },
        Color_700: { $type: "color", $value: "#334155" },
        Color_800: { $type: "color", $value: "#354053" },
        Color_900: { $type: "color", $value: "#252e42" },
        Color_950: { $type: "color", $value: "#01011f" },
        Color_1000: { $type: "color", $value: "#000002" },
      },
      Relation_Colors: {
        Color_Focus_100: { $type: "color", $value: "#f8e059" },
        Color_Focus_500: { $type: "color", $value: "#8f7a03" },
        "Color_hue-30-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-900": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-900": { $type: "color", $value: "#ffffff" },
      },
    },
    "Color Scheme.Info.tokens.json": {
      Base_Colors: {
        Color_0: { $type: "color", $value: "#ffffff" },
        Color_50: { $type: "color", $value: "#f2f6ff" },
        Color_100: { $type: "color", $value: "#e5eeff" },
        Color_200: { $type: "color", $value: "#c2d8ff" },
        Color_300: { $type: "color", $value: "#94bdff" },
        Color_400: { $type: "color", $value: "#5e9cff" },
        Color_500: { $type: "color", $value: "#1362eb" },
        Color_600: { $type: "color", $value: "#003fc8" },
        Color_700: { $type: "color", $value: "#0032a3" },
        Color_800: { $type: "color", $value: "#00174e" },
        Color_900: { $type: "color", $value: "#000c25" },
        Color_950: { $type: "color", $value: "#020d26" },
        Color_1000: { $type: "color", $value: "#000207" },
      },
      Relation_Colors: {
        Color_Focus_100: { $type: "color", $value: "#f8e059" },
        Color_Focus_500: { $type: "color", $value: "#8f7a03" },
        "Color_hue-30-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-900": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-900": { $type: "color", $value: "#ffffff" },
      },
    },
    "Color Scheme.Success.tokens.json": {
      Base_Colors: {
        Color_0: { $type: "color", $value: "#ffffff" },
        Color_50: { $type: "color", $value: "#f0fff4" },
        Color_100: { $type: "color", $value: "#e5ffec" },
        Color_200: { $type: "color", $value: "#bfeecd" },
        Color_300: { $type: "color", $value: "#90e0aa" },
        Color_400: { $type: "color", $value: "#5bcf83" },
        Color_500: { $type: "color", $value: "#0a9b3a" },
        Color_600: { $type: "color", $value: "#007b1b" },
        Color_700: { $type: "color", $value: "#006616" },
        Color_800: { $type: "color", $value: "#003d0d" },
        Color_900: { $type: "color", $value: "#002008" },
        Color_950: { $type: "color", $value: "#022008" },
        Color_1000: { $type: "color", $value: "#000a02" },
      },
      Relation_Colors: {
        Color_Focus_100: { $type: "color", $value: "#f8e059" },
        Color_Focus_500: { $type: "color", $value: "#8f7a03" },
        "Color_hue-30-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-900": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-900": { $type: "color", $value: "#ffffff" },
      },
    },
    "Color Scheme.Warning.tokens.json": {
      Base_Colors: {
        Color_0: { $type: "color", $value: "#ffffff" },
        Color_50: { $type: "color", $value: "#fff9ee" },
        Color_100: { $type: "color", $value: "#fff4dd" },
        Color_200: { $type: "color", $value: "#ffdb8f" },
        Color_300: { $type: "color", $value: "#ffc352" },
        Color_400: { $type: "color", $value: "#ffa61f" },
        Color_500: { $type: "color", $value: "#d98800" },
        Color_600: { $type: "color", $value: "#a36700" },
        Color_700: { $type: "color", $value: "#855200" },
        Color_800: { $type: "color", $value: "#462b00" },
        Color_900: { $type: "color", $value: "#291900" },
        Color_950: { $type: "color", $value: "#050300" },
        Color_1000: { $type: "color", $value: "#050300" },
      },
      Relation_Colors: {
        Color_Focus_100: { $type: "color", $value: "#a2d0ff" },
        Color_Focus_500: { $type: "color", $value: "#0055ac" },
        "Color_hue-30-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-900": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-900": { $type: "color", $value: "#ffffff" },
      },
    },
    "Color Scheme.Error.tokens.json": {
      Base_Colors: {
        Color_0: { $type: "color", $value: "#ffffff" },
        Color_50: { $type: "color", $value: "#fff3f3" },
        Color_100: { $type: "color", $value: "#ffe5e5" },
        Color_200: { $type: "color", $value: "#ffc7c7" },
        Color_300: { $type: "color", $value: "#ff9b9b" },
        Color_400: { $type: "color", $value: "#ff6363" },
        Color_500: { $type: "color", $value: "#e91717" },
        Color_600: { $type: "color", $value: "#d31010" },
        Color_700: { $type: "color", $value: "#b00c0c" },
        Color_800: { $type: "color", $value: "#690202" },
        Color_900: { $type: "color", $value: "#350000" },
        Color_950: { $type: "color", $value: "#070000" },
        Color_1000: { $type: "color", $value: "#070000" },
      },
      Relation_Colors: {
        Color_Focus_100: { $type: "color", $value: "#f8e059" },
        Color_Focus_500: { $type: "color", $value: "#8f7a03" },
        "Color_hue-30-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-30-900": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-100": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-500": { $type: "color", $value: "#ffffff" },
        "Color_hue-330-900": { $type: "color", $value: "#ffffff" },
      },
    },
    "Color Scheme.Blue Uchi.tokens.json": {
      Base_Colors: {
        Color_0: { $type: "color", $value: "#ffffff" },
        Color_50: { $type: "color", $value: "#f4f9ff" },
        Color_100: { $type: "color", $value: "#ddedfe" },
        Color_200: { $type: "color", $value: "#a2d0ff" },
        Color_300: { $type: "color", $value: "#489cf2" },
        Color_400: { $type: "color", $value: "#1677da" },
        Color_500: { $type: "color", $value: "#0c6dd0" },
        Color_600: { $type: "color", $value: "#014b96" },
        Color_700: { $type: "color", $value: "#003f7f" },
        Color_800: { $type: "color", $value: "#012952" },
        Color_900: { $type: "color", $value: "#001933" },
        Color_950: { $type: "color", $value: "#031a31" },
        Color_1000: { $type: "color", $value: "#000d1a" },
      },
      Relation_Colors: {
        Color_Focus_100: { $type: "color", $value: "#f8e059" },
        Color_Focus_500: { $type: "color", $value: "#8f7a03" },
        "Color_hue-30-100": { $type: "color", $value: "#ddfef9" },
        "Color_hue-30-500": { $type: "color", $value: "#0cd0a3" },
        "Color_hue-30-900": { $type: "color", $value: "#014838" },
        "Color_hue-330-100": { $type: "color", $value: "#ddccff" },
        "Color_hue-330-500": { $type: "color", $value: "#4d0cd0" },
        "Color_hue-330-900": { $type: "color", $value: "#3e178b" },
      },
    },
    "Color Mode.Light.tokens.json": {
      Base: { $type: "color", $value: "{Base_Colors.Color_0}" },
      Wash: { $type: "color", $value: "{Base_Colors.Color_50}" },
      Tint: { $type: "color", $value: "{Base_Colors.Color_100}" },
      Soft: { $type: "color", $value: "{Base_Colors.Color_200}" },
      Medium_Soft: { $type: "color", $value: "{Base_Colors.Color_300}" },
      Medium: { $type: "color", $value: "{Base_Colors.Color_400}" },
      Vivid: { $type: "color", $value: "{Base_Colors.Color_600}" },
      Vivid_Darker: { $type: "color", $value: "{Base_Colors.Color_700}" },
      Vivid_Darkest: { $type: "color", $value: "{Base_Colors.Color_800}" },
      Strong: { $type: "color", $value: "{Base_Colors.Color_700}" },
      Deep: { $type: "color", $value: "{Base_Colors.Color_800}" },
      Contrast: { $type: "color", $value: "{Base_Colors.Color_1000}" },
      Light: { $type: "color", $value: "{Base_Colors.Color_0}" },
      Dark: { $type: "color", $value: "{Base_Colors.Color_1000}" },
      Relation_Colors: {
        Shadow: { $type: "color", $value: "#5555554d" },
        Focus_Contrast: {
          $type: "color",
          $value: "{Relation_Colors.Color_Focus_100}",
        },
        Focus_Vivid: {
          $type: "color",
          $value: "{Relation_Colors.Color_Focus_500}",
        },
        Hue_30_vivid: {
          $type: "color",
          $value: "{Relation_Colors.Color_hue-30-500}",
        },
        Hue_30_soft: {
          $type: "color",
          $value: "{Relation_Colors.Color_hue-30-100}",
        },
        Hue_330_vivid: {
          $type: "color",
          $value: "{Relation_Colors.Color_hue-330-500}",
        },
        Hue_330_soft: {
          $type: "color",
          $value: "{Relation_Colors.Color_hue-330-100}",
        },
      },
    },
    "Color Mode.Dark.tokens.json": {
      Base: { $type: "color", $value: "{Base_Colors.Color_1000}" },
      Wash: { $type: "color", $value: "{Base_Colors.Color_900}" },
      Tint: { $type: "color", $value: "{Base_Colors.Color_800}" },
      Soft: { $type: "color", $value: "{Base_Colors.Color_800}" },
      Medium_Soft: { $type: "color", $value: "{Base_Colors.Color_700}" },
      Medium: { $type: "color", $value: "{Base_Colors.Color_600}" },
      Vivid: { $type: "color", $value: "{Base_Colors.Color_500}" },
      Vivid_Darker: { $type: "color", $value: "{Base_Colors.Color_600}" },
      Vivid_Darkest: { $type: "color", $value: "{Base_Colors.Color_700}" },
      Strong: { $type: "color", $value: "{Base_Colors.Color_200}" },
      Deep: { $type: "color", $value: "{Base_Colors.Color_100}" },
      Contrast: { $type: "color", $value: "{Base_Colors.Color_0}" },
      Light: { $type: "color", $value: "{Base_Colors.Color_0}" },
      Dark: { $type: "color", $value: "{Base_Colors.Color_1000}" },
      Relation_Colors: {
        Shadow: { $type: "color", $value: "#e8e8e84d" },
        Focus_Contrast: {
          $type: "color",
          $value: "{Relation_Colors.Color_Focus_100}",
        },
        Focus_Vivid: {
          $type: "color",
          $value: "{Relation_Colors.Color_Focus_500}",
        },
        Hue_30_vivid: {
          $type: "color",
          $value: "{Relation_Colors.Color_hue-30-500}",
        },
        Hue_30_soft: {
          $type: "color",
          $value: "{Relation_Colors.Color_hue-30-900}",
        },
        Hue_330_vivid: {
          $type: "color",
          $value: "{Relation_Colors.Color_hue-330-500}",
        },
        Hue_330_soft: {
          $type: "color",
          $value: "{Relation_Colors.Color_hue-330-900}",
        },
      },
    },
    "Themes.Uchi.tokens.json": {
      Font_Family: {
        Tokens: {
          "font-family-sans": { $type: "string", $value: "Source Sans Pro" },
          "font-family-serif": { $type: "string", $value: "Source Serif 4" },
          "font-family-slab": { $type: "string", $value: "Podkova" },
          "font-family-hand": { $type: "string", $value: "Shantell Sans" },
          "font-family-mono": { $type: "string", $value: "Source Code Pro" },
        },
        Alias: {
          Paragraph_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          Title_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          Button_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-serif}",
          },
          System_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
        },
      },
      Radius_Alias: {
        Button_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_S}",
        },
        Avatar_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Input_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_S}",
        },
        Badge_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_S}",
        },
        Checkbox_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XS}",
        },
        Switch_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Dots_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Container_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_S}",
        },
        Large_Container_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XL}",
        },
        Tab_topRight_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XL}",
        },
        Image_radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Surface_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_S}",
        },
      },
      Stroke_Alias: {
        Outline_Stroke: { $type: "dimension", $value: "1px" },
        Focus_Ring_Stroke: { $type: "dimension", $value: "2px" },
        Divider_Stroke: { $type: "dimension", $value: "1px" },
      },
      Opacity_Alias: {
        Text_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-80}",
        },
        Low_Text_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-60}",
        },
        Overlay_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-70}",
        },
      },
      Weight_Alias: {
        Button_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-500}",
        },
        Badge_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-500}",
        },
        Input_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-600}",
        },
        Bold_Text_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-700}",
        },
      },
      Width_Alias: {
        Content_Max_Width: { $type: "dimension", $value: "800px" },
        Page_Max_Width: { $type: "dimension", $value: "1400px" },
      },
      Height_Alias: {
        Tabs_Divider_Height: { $type: "dimension", $value: "2px" },
      },
      Icons_Alias: {
        Icons_Family: { $type: "string", $value: "Lucide" },
        Icons_Stroke: { $type: "dimension", $value: "0.3px" },
      },
    },
    "Themes.Cated.tokens.json": {
      Font_Family: {
        Tokens: {
          "font-family-sans": { $type: "string", $value: "Manrope" },
          "font-family-serif": { $type: "string", $value: "IBM Plex Serif" },
          "font-family-slab": { $type: "string", $value: "IBM Plex Serif" },
          "font-family-hand": { $type: "string", $value: "Shantell Sans" },
          "font-family-mono": { $type: "string", $value: "Source Code Pro" },
        },
        Alias: {
          Paragraph_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          Title_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-serif}",
          },
          Button_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          System_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
        },
      },
      Radius_Alias: {
        Button_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Avatar_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Input_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Badge_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Checkbox_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_S}",
        },
        Switch_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Dots_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Container_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_L}",
        },
        Large_Container_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XL}",
        },
        Tab_topRight_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XL}",
        },
        Image_radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Surface_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
      },
      Stroke_Alias: {
        Outline_Stroke: { $type: "dimension", $value: "1px" },
        Focus_Ring_Stroke: { $type: "dimension", $value: "2px" },
        Divider_Stroke: { $type: "dimension", $value: "1px" },
      },
      Opacity_Alias: {
        Text_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-80}",
        },
        Low_Text_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-60}",
        },
        Overlay_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-70}",
        },
      },
      Weight_Alias: {
        Button_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-500}",
        },
        Badge_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-500}",
        },
        Input_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-700}",
        },
        Bold_Text_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-700}",
        },
      },
      Width_Alias: {
        Content_Max_Width: { $type: "dimension", $value: "800px" },
        Page_Max_Width: { $type: "dimension", $value: "1400px" },
      },
      Height_Alias: {
        Tabs_Divider_Height: { $type: "dimension", $value: "84px" },
      },
      Icons_Alias: {
        Icons_Family: { $type: "string", $value: "Lucide" },
        Icons_Stroke: { $type: "dimension", $value: "0.8px" },
      },
    },
    "Themes.Human.tokens.json": {
      Font_Family: {
        Tokens: {
          "font-family-sans": { $type: "string", $value: "Manrope" },
          "font-family-serif": { $type: "string", $value: "Source Serif 4" },
          "font-family-slab": { $type: "string", $value: "Podkova" },
          "font-family-hand": { $type: "string", $value: "Shantell Sans" },
          "font-family-mono": { $type: "string", $value: "Source Code Pro" },
        },
        Alias: {
          Paragraph_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          Title_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          Button_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          System_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
        },
      },
      Radius_Alias: {
        Button_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Avatar_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XL}",
        },
        Input_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Badge_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Checkbox_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_S}",
        },
        Switch_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Dots_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Container_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Large_Container_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XL}",
        },
        Tab_topRight_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XL}",
        },
        Image_radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Surface_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
      },
      Stroke_Alias: {
        Outline_Stroke: { $type: "dimension", $value: "1px" },
        Focus_Ring_Stroke: { $type: "dimension", $value: "3px" },
        Divider_Stroke: { $type: "dimension", $value: "1px" },
      },
      Opacity_Alias: {
        Text_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-80}",
        },
        Low_Text_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-60}",
        },
        Overlay_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-70}",
        },
      },
      Weight_Alias: {
        Button_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-400}",
        },
        Badge_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-500}",
        },
        Input_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-500}",
        },
        Bold_Text_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-700}",
        },
      },
      Width_Alias: {
        Content_Max_Width: { $type: "dimension", $value: "800px" },
        Page_Max_Width: { $type: "dimension", $value: "1400px" },
      },
      Height_Alias: {
        Tabs_Divider_Height: { $type: "dimension", $value: "1px" },
      },
      Icons_Alias: {
        Icons_Family: { $type: "string", $value: "Material" },
        Icons_Stroke: { $type: "dimension", $value: "2px" },
      },
    },
    "Themes.Tech.tokens.json": {
      Font_Family: {
        Tokens: {
          "font-family-sans": { $type: "string", $value: "Source Sans Pro" },
          "font-family-serif": { $type: "string", $value: "Source Serif 4" },
          "font-family-slab": { $type: "string", $value: "Podkova" },
          "font-family-hand": { $type: "string", $value: "Shantell Sans" },
          "font-family-mono": { $type: "string", $value: "Source Code Pro" },
        },
        Alias: {
          Paragraph_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          Title_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          Button_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          System_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
        },
      },
      Radius_Alias: {
        Button_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XS}",
        },
        Avatar_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Input_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XS}",
        },
        Badge_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XS}",
        },
        Checkbox_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XS}",
        },
        Switch_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Dots_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Container_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XS}",
        },
        Large_Container_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XL}",
        },
        Tab_topRight_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XL}",
        },
        Image_radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_None}",
        },
        Surface_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_XS}",
        },
      },
      Stroke_Alias: {
        Outline_Stroke: { $type: "dimension", $value: "1px" },
        Focus_Ring_Stroke: { $type: "dimension", $value: "2px" },
        Divider_Stroke: { $type: "dimension", $value: "1px" },
      },
      Opacity_Alias: {
        Text_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-80}",
        },
        Low_Text_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-60}",
        },
        Overlay_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-70}",
        },
      },
      Weight_Alias: {
        Button_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-400}",
        },
        Badge_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-500}",
        },
        Input_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-400}",
        },
        Bold_Text_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-700}",
        },
      },
      Width_Alias: {
        Content_Max_Width: { $type: "dimension", $value: "800px" },
        Page_Max_Width: { $type: "dimension", $value: "1400px" },
      },
      Height_Alias: {
        Tabs_Divider_Height: { $type: "dimension", $value: "2px" },
      },
      Icons_Alias: {
        Icons_Family: { $type: "string", $value: "Lucide" },
        Icons_Stroke: { $type: "dimension", $value: "0.2px" },
      },
    },
    "Themes.Culture.tokens.json": {
      Font_Family: {
        Tokens: {
          "font-family-sans": { $type: "string", $value: "Source Sans Pro" },
          "font-family-serif": { $type: "string", $value: "Source Serif 4" },
          "font-family-slab": { $type: "string", $value: "Podkova" },
          "font-family-hand": { $type: "string", $value: "Shantell Sans" },
          "font-family-mono": { $type: "string", $value: "Source Code Pro" },
        },
        Alias: {
          Paragraph_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          Title_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          Button_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
          System_Font_Family: {
            $type: "string",
            $value: "{Font_Family.Tokens.font-family-sans}",
          },
        },
      },
      Radius_Alias: {
        Button_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Avatar_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Input_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Badge_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Checkbox_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_S}",
        },
        Switch_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Dots_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
        Container_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Large_Container_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Tab_topRight_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Image_radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_M}",
        },
        Surface_Radius: {
          $type: "dimension",
          $value: "{Radius_Tokens.Radius_Full}",
        },
      },
      Stroke_Alias: {
        Outline_Stroke: { $type: "dimension", $value: "2px" },
        Focus_Ring_Stroke: { $type: "dimension", $value: "3px" },
        Divider_Stroke: { $type: "dimension", $value: "2px" },
      },
      Opacity_Alias: {
        Text_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-80}",
        },
        Low_Text_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-60}",
        },
        Overlay_Opacity: {
          $type: "dimension",
          $value: "{Opacity_Tokens.Base.opacity-70}",
        },
      },
      Weight_Alias: {
        Button_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-600}",
        },
        Badge_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-500}",
        },
        Input_Label_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-700}",
        },
        Bold_Text_Weight: {
          $type: "dimension",
          $value: "{Font_Weight_Tokens.font-weight-700}",
        },
      },
      Width_Alias: {
        Content_Max_Width: { $type: "dimension", $value: "800px" },
        Page_Max_Width: { $type: "dimension", $value: "1400px" },
      },
      Height_Alias: {
        Tabs_Divider_Height: { $type: "dimension", $value: "2px" },
      },
      Icons_Alias: {
        Icons_Family: { $type: "string", $value: "Lucide" },
        Icons_Stroke: { $type: "dimension", $value: "0.7px" },
      },
    },
    "effect.styles.tokens.json": {
      "Shadow 1": {
        $type: "shadow",
        $value: [
          {
            offsetX: "0px",
            offsetY: "2px",
            blur: "4px",
            spread: "0px",
            color: "{Relation Colors.Shadow}",
          },
        ],
      },
      "Shadow 2": {
        $type: "shadow",
        $value: [
          {
            offsetX: "0px",
            offsetY: "4px",
            blur: "4px",
            spread: "0px",
            color: "{Relation Colors.Shadow}",
          },
        ],
      },
      "Shadow 3": {
        $type: "shadow",
        $value: [
          {
            offsetX: "0px",
            offsetY: "4px",
            blur: "8px",
            spread: "0px",
            color: "{Relation Colors.Shadow}",
          },
        ],
      },
      "Shadow 4": {
        $type: "shadow",
        $value: [
          {
            offsetX: "0px",
            offsetY: "4px",
            blur: "8px",
            spread: "4px",
            color: "{Relation Colors.Shadow}",
          },
        ],
      },
      "Shadow 5": {
        $type: "shadow",
        $value: [
          {
            offsetX: "0px",
            offsetY: "4px",
            blur: "12px",
            spread: "4px",
            color: "{Relation Colors.Shadow}",
          },
        ],
      },
      "Hover shadow": {
        $type: "shadow",
        $value: [
          {
            offsetX: "0px",
            offsetY: "0px",
            blur: "12px",
            spread: "4px",
            color: "{Hover}",
          },
        ],
      },
      "Active Shadow": {
        $type: "shadow",
        $value: [
          {
            offsetX: "0px",
            offsetY: "0px",
            blur: "12px",
            spread: "4px",
            color: "{Active}",
          },
        ],
      },
    },
  },
};
