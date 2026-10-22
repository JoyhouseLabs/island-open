import type { FurnitureDefinition } from "@island/contracts";
/** Small vector previews match each procedural model without mounting 12 WebGL canvases. */
export default function FurnitureThumbnail({
  item: d,
}: {
  item: FurnitureDefinition;
}) {
  const c = d.color;
  return (
    <svg
      viewBox="0 0 160 100"
      width="160"
      height="100"
      role="img"
      aria-label={`${d.name}外观预览`}
    >
      <ellipse cx="80" cy="86" rx="44" ry="8" fill="#344d4010" />
      {d.shape === "chair" && (
        <g stroke="#765a43" strokeWidth="5" strokeLinejoin="round">
          <path d="M57 59v25m42-24v23M68 53v19m25-23v23" />
          <path d="M55 55V21l42-5v34" fill={c} />
          <path d="M55 34l42-5" />
          <path d="M52 56l39-9 19 14-40 10z" fill={c} />
          <path d="M70 70v21m40-30v24" />
        </g>
      )}
      {d.shape === "table" && (
        <g stroke="#765a43" strokeWidth="5" strokeLinejoin="round">
          <path d="M38 49v32m82-30v32M64 39v30m38 3v21" />
          <path d="M31 45l57-17 43 23-60 20z" fill={c} />
          <path d="M31 45v7l40 25 60-20v-6" fill={c} />
        </g>
      )}
      {d.shape === "sofa" && (
        <g stroke="#668577" strokeWidth="3" strokeLinejoin="round">
          <path d="M34 51V28q0-7 8-7h70q10 0 10 9v31" fill={c} />
          <path d="M35 53l63-6 27 20-72 11z" fill="#b1c9b5" />
          <path
            d="M32 48l16 6v25l-16-7zm16 31 77-8V49l-14-4-1 17-62 7z"
            fill={c}
          />
          <path d="M37 74v10m79-9v10" stroke="#765a43" />
        </g>
      )}
      {d.shape === "stool" && (
        <g stroke="#a88858" strokeWidth="5">
          <path d="M57 53l-3 31m48-30 3 30M80 62v27" />
          <ellipse cx="80" cy="49" rx="33" ry="16" fill={c} />
          <path d="M47 49v8q33 30 66 0v-8" fill={c} />
          <ellipse cx="80" cy="49" rx="33" ry="14" fill={c} />
        </g>
      )}
      {d.shape === "rug" && (
        <g stroke="#f7edcf" strokeWidth="3">
          <path d="M25 57l66-29 47 30-65 29z" fill={c} />
          <path d="M40 56l50-22 33 23-49 23z" fill="none" />
          <path d="M27 59l-6 3m12 1-6 3m12 1-6 3m12 1-6 3m12 1-6 3m12 1-6 3m12 1-6 3" />
        </g>
      )}
      {d.shape === "lamp" && (
        <g stroke={c} strokeWidth="5">
          <ellipse cx="80" cy="83" rx="16" ry="5" fill={c} />
          <path d="M80 82V37" />
          <circle cx="80" cy="29" r="14" fill="#ffe4a0" strokeWidth="3" />
          <path d="M61 17h38" />
        </g>
      )}
      {d.shape === "pot" && (
        <>
          <path d="M62 59l5 26q14 8 27 0l6-26z" fill="#bc8060" />
          <ellipse cx="81" cy="59" rx="19" ry="7" fill="#d6a085" />
          <path d="M80 62V30" stroke="#628553" strokeWidth="5" />
          <ellipse
            cx="69"
            cy="43"
            rx="13"
            ry="8"
            fill="#6c9973"
            transform="rotate(25 69 43)"
          />
          <ellipse
            cx="91"
            cy="36"
            rx="13"
            ry="8"
            fill="#6c9973"
            transform="rotate(-30 91 36)"
          />
          <circle cx="80" cy="26" r="14" fill={c} />
          {d.id === "flower-pot" && (
            <circle cx="80" cy="26" r="5" fill="#f4d68c" />
          )}
        </>
      )}
      {d.shape === "fence" && (
        <g stroke="#bcb9a4" strokeWidth="1.5" fill={c}>
          <path d="M25 44h110v8H25zm0 23h110v8H25z" />
          {[34, 57, 80, 103, 126].map((x) => (
            <path key={x} d={`M${x - 5} 86V32l5-9 5 9v54z`} />
          ))}
        </g>
      )}
      {d.shape === "birdhouse" && (
        <>
          <path d="M77 60h7v29h-7z" fill="#87684e" />
          <path d="M56 34h49v33H56z" fill={c} />
          <path d="M48 36l32-23 33 23z" fill="#739281" />
          <circle cx="80" cy="48" r="8" fill="#57483b" />
          <path d="M79 61h16" stroke="#87684e" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}
