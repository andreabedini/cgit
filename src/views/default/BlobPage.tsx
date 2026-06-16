import { Breadcrumb } from "./Breadcrumb";
import { encodeSegments } from "./paths";

export interface BlobProps {
  name: string;
  ref: string;
  path: string;
  kind: "text" | "binary" | "image";
  highlighted?: string; // Shiki HTML, present when kind === "text"
  size: number;
}

export function BlobPage(props: BlobProps) {
  const rawHref = `/${encodeURIComponent(props.name)}/raw/${encodeSegments(props.ref)}/${encodeSegments(props.path)}`;
  return (
    <>
      <title>{`${props.name}: ${props.path}`}</title>
      <Breadcrumb name={props.name} ref={props.ref} path={props.path} />
      <p>
        <a href={rawHref}>raw</a> &middot; {props.size} bytes
      </p>
      {props.kind === "image" ? (
        <img class="blob-image" src={rawHref} alt={props.path} />
      ) : props.kind === "binary" ? (
        <p class="binary">Binary file not shown.</p>
      ) : (
        <div class="blob" dangerouslySetInnerHTML={{ __html: props.highlighted ?? "" }} />
      )}
    </>
  );
}
