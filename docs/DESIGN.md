# Design — Computational Luxury

## Thesis

contexxxt presents engineering evidence with the quiet confidence of an architectural studio: precise, material, restrained and legible. The product artifact is the visual language. ContextPackets, Evidence, 7Q state, the Project Model and evaluation results replace generic SaaS decoration.

The methodological references are Impeccable's conviction, Diagram Design's explanatory clarity and Codebase Memory's technical proof. Their visual identities are not copied.

## Materials and color

- **Warm Ivory** `#F3F1EE`: primary light editorial field.
- **Soft Bone** `#E5E1DC`: secondary light material.
- **Graphite** `#242322`: primary light typography.
- **Deep Pine** `#0F2C24`: verified knowledge and grounded intelligence.
- **Steel Blue** `#46617E`: technical structure, analysis and precision.
- **Cold Silver** `#C7C9C8`: separators and quiet metallic detail.
- **Deep Void** `#0B0F0E`: primary dark field.

Color behaves like material, not paint. Pine and steel are used for hierarchy and state; neither floods every surface. Dark mode uses pine-black surfaces, ivory type and low-chroma steel details rather than pure white on pure black.

## Typography

- **Sora**: wordmark, hero and major product statements.
- **Geist**: body, navigation and interface.
- **Geist Mono**: commands, evidence IDs, metrics, schema names and metadata.
- **Instrument Serif Italic**: rare editorial accents only.

All four families are packaged locally through Fontsource. The public landing does not rely on runtime font APIs.

## Composition

- Editorial asymmetry and deliberate negative space.
- Thin rules, square corners and restrained material contrast.
- Technical plates, specimen rows, layered documents and precise annotations.
- No decorative gradients, glassmorphism, glow, inflated radius or generic feature-card grids.
- Motion is limited to state change and precise feedback, with reduced-motion support.

## Identity

The custom mark compresses three intersecting X forms into an inverted triangular spine and resolves into a T stem. It must remain recognizable at favicon and navigation sizes, use `currentColor` where practical and avoid AI sparkle or mascot language.

## Product diagrams

Diagrams use Diagram Design's architecture and process grammar with a contexxxt skin: warm ivory / deep void paper, graphite / ivory ink, pine as the single focal accent and steel as structural support. Connectors are orthogonal, arrows are drawn behind nodes, node count stays bounded and every SVG provides a title and description.

The full product diagram is capped at nine nodes. Provider internals and detailed evaluation mechanics remain outside it. The simplified homepage diagram uses four stages. The 7Q plate is a product-state visualization rather than a generic flowchart.

## Interaction and accessibility

- Theme follows `prefers-color-scheme` on first visit and persists explicit choice.
- English and Spanish are static Astro routes, not client-side string replacement.
- Theme, language and copy controls are keyboard accessible with visible focus.
- Information hierarchy is identical across themes and meaning never relies on color alone.
- Reduced motion disables non-essential transitions.

## Responsive behavior

Desktop composition is not merely collapsed on mobile. At 390 px, editorial sections change order, technical plates become scrollable only when their geometry requires it, 7Q states move to a single-column specimen, and commands preserve readable horizontal scrolling without page overflow.

## Evidence rules

- Benchmark language always says current bounded evaluation or equivalent.
- `0.2.0-rc.1` is described as repository source, never as the npm latest.
- npm installation copy names public `0.1.0` explicitly.
- Generated skills are never described as promoted without an evaluation decision.
- No customer, usage, pricing, quality or performance claim may be invented.
