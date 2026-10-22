import type { CatWork } from "@island/contracts";
export const initialCat: CatWork = { headWidth: 1, color: "#e7a35b", note: "" };
/** Eight major shapes: head/paws are circles; ears triangles; body/tail/belly ellipses. */
export default function CatPicture({
  work = initialCat,
  separated = false,
}: {
  work?: CatWork;
  separated?: boolean;
}) {
  return (
    <svg
      className="learn-cat"
      viewBox="0 0 360 330"
      role="img"
      aria-label="小猫模型：三个圆、两个三角形、三个椭圆，五官另算"
    >
      <ellipse cx="180" cy="307" rx="111" ry="12" fill="#284d3910" />
      <g
        fill={work.color}
        stroke="#715342"
        strokeWidth="3"
        strokeLinejoin="round"
      >
        <ellipse
          cx={separated ? 300 : 255}
          cy="230"
          rx="20"
          ry="67"
          transform={`rotate(30 ${separated ? 300 : 255} 230)`}
        />
        <ellipse cx="180" cy="224" rx="58" ry="72" />
        <ellipse cx="180" cy="237" rx="30" ry="41" fill="#fff4df" />
        <circle cx={separated ? 104 : 145} cy="289" r="23" />
        <circle cx={separated ? 256 : 215} cy="289" r="23" />
        <g
          transform={`translate(180 ${separated ? 103 : 118}) scale(${work.headWidth} 1)`}
        >
          <path
            d={
              separated
                ? "M-69 -52 L-80 -102 L-30 -73 Z"
                : "M-56 -28 L-62 -83 L-12 -49 Z"
            }
          />
          <path
            d={
              separated
                ? "M69 -52 L80 -102 L30 -73 Z"
                : "M56 -28 L62 -83 L12 -49 Z"
            }
          />
          <circle r="64" />
          <g fill="#43392f" stroke="none">
            <circle cx="-23" cy="-2" r="5" />
            <circle cx="23" cy="-2" r="5" />
            <path d="M-7 13 L7 13 L0 20 Z" />
          </g>
          <path d="M0 20 Q-7 32 -17 24 M0 20 Q7 32 17 24" fill="none" />
        </g>
      </g>
    </svg>
  );
}
