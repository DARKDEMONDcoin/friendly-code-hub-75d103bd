// IOSImage — image with iOS-style smooth loading: dark placeholder + shimmer that
// fades into the image with a soft blur-up once decoded. Uses native lazy loading
// + async decode for snappy feel.
import { useState, type ImgHTMLAttributes } from "react";

interface Props extends ImgHTMLAttributes<HTMLImageElement> {
  /** Optional aspect ratio (e.g. "3/4" or "1/1") to reserve space and prevent CLS. */
  aspect?: string;
}

export const IOSImage = ({ aspect, className, style, onLoad, ...rest }: Props) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: aspect, backgroundColor: "#1a1a1a" }}
    >
      {/* Shimmer placeholder — disappears when the real image is ready */}
      {!loaded && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(110deg, rgba(255,255,255,0.02) 8%, rgba(255,255,255,0.06) 18%, rgba(255,255,255,0.02) 33%)",
            backgroundSize: "200% 100%",
            animation: "iosShimmer 1.6s linear infinite",
          }}
        />
      )}

      <img
        {...rest}
        loading={rest.loading ?? "lazy"}
        decoding={rest.decoding ?? "async"}
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
        className={(className ?? "") + " block w-full h-full"}
        style={{
          opacity: loaded ? 1 : 0,
          filter: loaded ? "blur(0px)" : "blur(12px)",
          transform: loaded ? "scale(1)" : "scale(1.02)",
          transition:
            "opacity 520ms cubic-bezier(0.22, 1, 0.36, 1), filter 520ms cubic-bezier(0.22, 1, 0.36, 1), transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
          ...style,
        }}
      />
    </div>
  );
};
