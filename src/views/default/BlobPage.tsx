import { Breadcrumb } from "./Breadcrumb";
import { encodeSegments } from "./paths";

export interface BlobProps {
  name: string;
  ref: string;
  path: string;
  binary: boolean;
  text?: string;   // present when !binary
  size: number;
}

export function BlobPage(props: BlobProps) {
  const rawHref = `/${encodeURIComponent(props.name)}/raw/${encodeSegments(props.ref)}/${encodeSegments(props.path)}`;
  const lines = (props.text ?? "").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return (
    <>
      <title>{`${props.name}: ${props.path}`}</title>
      <Breadcrumb name={props.name} ref={props.ref} path={props.path} />
      <p>
        <a href={rawHref}>raw</a> &middot; {props.size} bytes
      </p>
      {props.binary ? (
        <p class="binary">Binary file not shown.</p>
      ) : (
        <div class="blob">
          <pre class="linenos">{lines.map((_, i) => i + 1).join("\n")}</pre>
          <pre class="code">{lines.join("\n")}</pre>
        </div>
      )}
    </>
  );
}
