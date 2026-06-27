/** @doc 404 page shown when the requested route doesn't exist. */
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-ink px-5">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 inline-flex h-24 w-36 items-center justify-center rounded-[26px] bg-brand-action border-[2.5px] border-brand-ink shadow-[4px_4px_0_rgba(59,130,246,0.28)]">
          <span className="text-[52px] font-black text-brand-ink leading-none tracking-tight">
            404
          </span>
        </div>
        <h1 className="text-3xl font-black text-brand-parchment mb-2">Page not found</h1>
        <p className="text-sm text-brand-muted mb-7">
          The page you’re looking for doesn’t exist or was moved.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center w-full rounded-full bg-brand-action text-brand-ink px-5 py-3 text-sm font-black border-[2.5px] border-brand-ink shadow-[3px_3px_0_rgba(59,130,246,0.32)] active:translate-x-[2px] active:translate-y-[2px] transition-all no-underline"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
