import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { Download } from "lucide-react";

export const COLORS = [
  "#267f76",
  "#a64164",
  "#bd7c18",
  "#4877b5",
  "#8060a6",
  "#577d37",
];
export const whiteBackground = {
  id: "whiteBackground",
  beforeDraw({ ctx, width, height }) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};
export default function ResultsChart({
  stats,
  errorMode = "sd",
  showPoints = true,
  units,
  annotation = "",
}) {
  const canvas = useRef(null);
  useEffect(() => {
    const spread = (s) => (errorMode === "none" ? 0 : (s[errorMode] ?? 0));
    const low = Math.min(
      0,
      ...stats.flatMap((s) => [s.mean - spread(s), ...s.values]),
    );
    const high = Math.max(
      0,
      ...stats.flatMap((s) => [s.mean + spread(s), ...s.values]),
    );
    const pad = (high - low || 1) * 0.12;
    const errorBars = {
      id: "errorBars",
      afterDatasetsDraw(chart) {
        if (errorMode === "none") return;
        const {
          ctx,
          scales: { x, y },
        } = chart;
        ctx.save();
        ctx.strokeStyle = "#253a38";
        ctx.lineWidth = 1.5;
        stats.forEach((s, i) => {
          if (s[errorMode] === null) return;
          const px = x.getPixelForValue(i),
            top = y.getPixelForValue(s.mean + spread(s)),
            bottom = y.getPixelForValue(s.mean - spread(s));
          ctx.beginPath();
          ctx.moveTo(px, top);
          ctx.lineTo(px, bottom);
          ctx.moveTo(px - 6, top);
          ctx.lineTo(px + 6, top);
          ctx.moveTo(px - 6, bottom);
          ctx.lineTo(px + 6, bottom);
          ctx.stroke();
        });
        ctx.restore();
      },
    };
    const chart = new Chart(canvas.current, {
      type: "bar",
      plugins: [whiteBackground, errorBars],
      data: {
        datasets: [
          {
            label: "Mean",
            data: stats.map((s, i) => ({ x: i, y: s.mean })),
            backgroundColor: stats.map(
              (_, i) => COLORS[i % COLORS.length] + "99",
            ),
            barThickness: 38,
            order: 2,
          },
          ...(showPoints
            ? [
                {
                  type: "scatter",
                  label: "Sample values",
                  data: stats.flatMap((s, i) =>
                    s.values.map((v, j) => ({
                      x: i + ((j % 7) - 3) * 0.045,
                      y: v,
                      well: s.wells[j],
                      sample: s.sampleIds[j],
                    })),
                  ),
                  backgroundColor: "#253a38",
                  pointRadius: 2.5,
                  order: 1,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            type: "linear",
            min: -0.6,
            max: stats.length - 0.4,
            grid: { display: false },
            ticks: {
              stepSize: 1,
              autoSkip: false,
              callback: (v) =>
                Number.isInteger(v) && stats[v]
                  ? stats[v].name.match(/.{1,20}/g)
                  : "",
              font: { size: 12 },
            },
          },
          y: {
            min: low < 0 ? low - pad : 0,
            max: high > 0 ? high + pad : pad,
            title: { display: !!units, text: units },
            grid: { color: "#e4e9e7" },
          },
        },
        plugins: {
          title: {
            display: true,
            text:
              "Sample means" +
              (errorMode === "none" ? "" : " ± " + errorMode.toUpperCase()),
          },
          subtitle: {
            display: !!annotation,
            text: annotation.match(/.{1,60}(?:\s|$)|.{1,60}/g) || [],
            padding: 12,
            color: "#253a38",
            font: { size: 12 },
          },
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) =>
                stats[Math.round(items[0].parsed.x)]?.name || "",
              label: (item) =>
                item.raw.well
                  ? item.raw.well +
                    " · " +
                    item.raw.sample +
                    ": " +
                    item.parsed.y.toPrecision(5)
                  : "Mean: " + item.parsed.y.toPrecision(5),
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [stats, errorMode, showPoints, units, annotation]);
  function download() {
    const a = document.createElement("a");
    a.href = canvas.current.toDataURL("image/png");
    a.download = "plate-group-comparison.png";
    a.click();
  }
  return (
    <>
      <div className="plot-scroll">
        <div
          className="plot"
          style={{ minWidth: Math.max(320, stats.length * 100) }}
        >
          <canvas
            ref={canvas}
            role="img"
            aria-label={
              "Group means" +
              (errorMode === "none" ? " without error bars" : " with " + errorMode.toUpperCase() + " error bars") +
              (showPoints ? " and individual samples" : "")
            }
          />
        </div>
      </div>
      <button
        className="icon-button"
        onClick={download}
        title="Download graph PNG"
        aria-label="Download graph PNG"
      >
        <Download size={18} />
      </button>
    </>
  );
}
