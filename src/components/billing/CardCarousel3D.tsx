/** @doc 3D horizontal cylinder carousel of premium animated bank cards. */
import React, { useState, useEffect, useRef } from "react";

const CARD_VIDEOS = [
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_030111_a9e15665-d379-4a7f-8116-695bbe452ad1.mp4",
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260429_171347_f640c30d-ec21-426a-98bc-77e07c2c60cb.mp4",
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260503_104800_bc43ae09-f494-43e3-97d7-2f8c1692cfd7.mp4",
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_161253_c72b1869-400f-45ed-ac0c-52f68c2ed5bd.mp4",
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_115655_b4d9cd77-feed-43cd-a198-af78ebdf1f7a.mp4",
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_024928_1efd0b0d-6c02-45a8-8847-1030900c4f63.mp4",
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_024928_1efd0b0d-6c02-45a8-8847-1030900c4f63.mp4",
];

const CARD_DETAILS = [
  { number: "4232 8908 1121 4892", name: "ZACHARY MERCER", cvv: "382" },
  { number: "4154 7831 9904 5124", name: "SOPHIA MARTINEZ", cvv: "109" },
  { number: "5457 4120 7733 9035", name: "BENJAMIN CARTER", cvv: "764" },
  { number: "4441 5567 1223 2468", name: "EMILY MORRISON", cvv: "491" },
  { number: "5375 8891 2234 7713", name: "JACKSON REID", cvv: "255" },
];

interface Props {
  height?: number;
}

export default function CardCarousel3D({ height = 360 }: Props) {
  const cardCount = 5;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardsRefs = useRef<(HTMLDivElement | null)[]>([]);
  const frameId = useRef<number>(0);

  const progress = useRef<number>(0);
  const mouse = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  const [metrics, setMetrics] = useState({ cardW: 280, cardH: 176 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const rx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const ry = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      mouse.current.targetX = Math.max(-1, Math.min(1, rx));
      mouse.current.targetY = Math.max(-1, Math.min(1, ry));
    };
    const handleLeave = () => {
      mouse.current.targetX = 0;
      mouse.current.targetY = 0;
    };
    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseleave", handleLeave);
    return () => {
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  useEffect(() => {
    const compute = () => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      let cardW = Math.round(Math.min(w * 0.7, 320));
      cardW = Math.min(320, Math.max(160, cardW));
      const cardH = Math.round(cardW / 1.5925);
      // Make sure 5 cards plus gaps fit in height
      const maxCardH = Math.floor((h - 60) / 1.6);
      const finalCardH = Math.min(cardH, maxCardH);
      const finalCardW = Math.round(finalCardH * 1.5925);
      setMetrics({ cardW: finalCardW, cardH: finalCardH });
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const renderLoop = () => {
    progress.current += 0.0016;
    mouse.current.x += (mouse.current.targetX - mouse.current.x) * 0.08;
    mouse.current.y += (mouse.current.targetY - mouse.current.y) * 0.08;

    const cards = cardsRefs.current;
    const el = containerRef.current;
    if (!el) return;
    const h = el.clientHeight;
    const { cardH } = metrics;

    const continuousProgress = progress.current;
    const roundedIndex = Math.round(continuousProgress);
    const diffFromRound = continuousProgress - roundedIndex;
    const easedDiff = Math.sign(diffFromRound) * Math.pow(Math.abs(diffFromRound) * 2, 4.2) / 2;
    const virtualActiveIndex = roundedIndex + easedDiff;

    for (let i = 0; i < cardCount; i++) {
      const card = cards[i];
      if (!card) continue;
      let offset = i - virtualActiveIndex;
      const halfCount = cardCount / 2;
      while (offset > halfCount) offset -= cardCount;
      while (offset < -halfCount) offset += cardCount;

      const absOffset = Math.abs(offset);
      const sign = Math.sign(offset);
      if (absOffset > 3.0) {
        card.style.visibility = "hidden";
        continue;
      } else {
        card.style.visibility = "visible";
      }

      const gap = 24;
      const peekAmount = -40;
      const D = 1350;
      let y = 0,
        z = 0,
        rot = 0;

      if (absOffset <= 1) {
        const t = absOffset;
        const easedT = t * t * (3 - 2 * t);
        const targetY = cardH + gap;
        y = -sign * (easedT * targetY);
        z = 400 + easedT * (220 - 400);
        rot = easedT * 132;
      } else if (absOffset <= 2) {
        const t = absOffset - 1;
        const easedT = t * t * (3 - 2 * t);
        const yStart = cardH + gap;
        const zStart = 220;
        const rotStart = 132;
        const zEnd = -60;
        const rotEnd = 175;
        const sEnd = D / (D - zEnd);
        const yEnd = (h / 2 - peekAmount) / sEnd - cardH / 2;
        y = -sign * (yStart + easedT * (yEnd - yStart));
        z = zStart + easedT * (zEnd - zStart);
        rot = rotStart + easedT * (rotEnd - rotStart);
      } else {
        const t = Math.min(absOffset - 2, 1);
        const easedT = t * t * (3 - 2 * t);
        const zStart = -60;
        const rotStart = 175;
        const zEnd3 = -250;
        const rotEnd3 = 195;
        const sEnd2 = D / (D - zStart);
        const yEnd2 = (h / 2 - peekAmount) / sEnd2 - cardH / 2;
        const sEnd3 = D / (D - zEnd3);
        const yEnd3 = (h / 2 + 100) / sEnd3 + cardH / 2;
        y = -sign * (yEnd2 + easedT * (yEnd3 - yEnd2));
        z = zStart + easedT * (zEnd3 - zStart);
        rot = rotStart + easedT * (rotEnd3 - rotStart);
      }

      const localCardRotation = -sign * rot;
      const centerFactor = Math.max(0, 1 - absOffset);
      const activeTiltX = -mouse.current.y * 12 * centerFactor;
      const activeTiltY = mouse.current.x * 15 * centerFactor;
      const totalRotX = localCardRotation + activeTiltX;
      const totalRotY = activeTiltY;

      card.style.zIndex = Math.round(z).toString();
      card.style.opacity = "1";
      card.style.transform = `translateY(${y.toFixed(2)}px) translateZ(${z.toFixed(2)}px) rotateX(${totalRotX.toFixed(2)}deg) rotateY(${totalRotY.toFixed(2)}deg) rotateZ(-3deg)`;
    }
  };

  useEffect(() => {
    const tick = () => {
      renderLoop();
      frameId.current = requestAnimationFrame(tick);
    };
    frameId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId.current);
  }, [metrics]);

  const thicknessLayers = [-1.47, -0.73, 0, 0.73, 1.47];

  return (
    <div
      ref={containerRef}
      className="card-carousel-3d relative w-full overflow-hidden rounded-2xl bg-black select-none"
      style={{ height }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ perspective: "1350px" }}
      >
        <div
          className="relative"
          style={{
            width: `${metrics.cardW}px`,
            height: `${metrics.cardH}px`,
            transformStyle: "preserve-3d",
          }}
        >
          {Array.from({ length: cardCount }).map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                cardsRefs.current[i] = el;
              }}
              className="absolute inset-0"
              style={{
                width: `${metrics.cardW}px`,
                height: `${metrics.cardH}px`,
                transformStyle: "preserve-3d",
                backfaceVisibility: "visible",
              }}
            >
              {thicknessLayers.map((zOffset, layerIdx) => {
                const isFrontFace = layerIdx === thicknessLayers.length - 1;
                const isBackFace = layerIdx === 0;
                const videoSrc = CARD_VIDEOS[i % CARD_VIDEOS.length];
                const baseBgColor = "#0f0f0f";

                if (!isFrontFace && !isBackFace) {
                  return (
                    <div
                      key={layerIdx}
                      className="absolute inset-0 rounded-[16px] pointer-events-none overflow-hidden"
                      style={{
                        backgroundColor: "#808080",
                        borderColor: "#808080",
                        borderWidth: 1,
                        borderStyle: "solid",
                        transform: `translateZ(${zOffset}px)`,
                      }}
                    />
                  );
                }

                if (isFrontFace) {
                  return (
                    <div
                      key={layerIdx}
                      className="absolute inset-0 rounded-[16px] pointer-events-none overflow-hidden"
                      style={{
                        backgroundColor: baseBgColor,
                        borderColor: "rgba(255,255,255,0.15)",
                        borderWidth: 1,
                        borderStyle: "solid",
                        transform: `translateZ(${zOffset}px)`,
                        backfaceVisibility: "hidden",
                        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.15)",
                      }}
                    >
                      <video
                        src={videoSrc}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover rounded-[16px]"
                      />
                      <div className="absolute inset-0 p-5" style={{ background: "rgba(0,0,0,0.15)" }}>
                        <div className="absolute left-5 top-1/2 -translate-y-1/2">
                          <svg width="26" height="26" viewBox="0 0 60 60" fill="none">
                            <path
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M20 8H40V14C40.0016 14.5299 40.2128 15.0377 40.5875 15.4125C40.9623 15.7872 41.4701 15.9984 42 16H59V24H42C41.4701 24.0016 40.9623 24.2128 40.5875 24.5875C40.2128 24.9623 40.0016 25.4701 40 26V52H20V8ZM18 8H8.00039C4.47435 8 1.56576 10.6083 1.08 14H18V8ZM1 16V24V26V34V36V44H18V36H1V34H18V26H1V24H18V16H1ZM1.08 46C1.56576 49.3917 4.47435 52 8.00039 52H18V46H1.08ZM42 14V8H52.0004C55.5264 8 58.4342 10.6084 58.92 14H42ZM59 26H42V34H59V26ZM59 36H42V44H59V36ZM52.0004 52H42V46H58.92C58.4342 49.3916 55.5264 52 52.0004 52Z"
                              fill={`url(#chipgrad_${i})`}
                            />
                            <defs>
                              <linearGradient id={`chipgrad_${i}`} x1="30" y1="8" x2="30" y2="52" gradientUnits="userSpaceOnUse">
                                <stop stopColor="white" />
                                <stop offset="1" stopColor="#999999" />
                              </linearGradient>
                            </defs>
                          </svg>
                        </div>
                        <div className="absolute right-5 bottom-5 flex -space-x-2 items-center" style={{ opacity: 0.9 }}>
                          <div className="w-5 h-5 rounded-full" style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.1)" }} />
                          <div className="w-5 h-5 rounded-full" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.1)" }} />
                        </div>
                      </div>
                    </div>
                  );
                }

                if (isBackFace) {
                  const details = CARD_DETAILS[i % CARD_DETAILS.length];
                  return (
                    <div
                      key={layerIdx}
                      className="absolute inset-0 rounded-[16px] pointer-events-none overflow-hidden"
                      style={{
                        backgroundColor: baseBgColor,
                        borderColor: "rgba(255,255,255,0.15)",
                        borderWidth: 1,
                        borderStyle: "solid",
                        transform: `translateZ(${zOffset}px) rotateX(180deg)`,
                        backfaceVisibility: "hidden",
                        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.15)",
                      }}
                    >
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ filter: "blur(16px)", transform: "scale(1.15)" }}
                      >
                        <video
                          src={videoSrc}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      </div>
                      <div
                        className="absolute left-0 right-0 top-4 h-7"
                        style={{ background: "rgba(0,0,0,0.85)" }}
                      />
                      <div
                        className="absolute left-5 bottom-4 flex flex-col gap-1 text-left"
                        style={{ fontFamily: '"JetBrains Mono", monospace', color: "#fff" }}
                      >
                        <div className="text-[11px]" style={{ letterSpacing: "0.14em" }}>
                          {details.number}
                        </div>
                        <div className="text-[8px] flex items-center gap-2" style={{ color: "rgba(255,255,255,0.7)" }}>
                          <span>{details.name}</span>
                          <span style={{ color: "rgba(255,255,255,0.4)" }}>•</span>
                          <span>CVV: {details.cvv}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}