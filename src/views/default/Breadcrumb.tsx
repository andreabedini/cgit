// Path breadcrumb shared by the tree and blob views. Renders
// `name / ref / seg / seg ...` where every parent segment links back into the
// `/tree/` route and the final segment is plain text.
import { encodeSegments } from "./paths";

export function Breadcrumb(props: { name: string; ref: string; path: string }) {
  const segments = props.path.split("/").filter(Boolean);
  const base = `/${encodeURIComponent(props.name)}/tree/${encodeSegments(props.ref)}`;
  let acc = "";
  return (
    <nav class="cg-subcrumb">
      <a href={`${base}/`}>{props.name}</a>
      <span class="slash">/</span>
      <span class="here">{props.ref}</span>
      {segments.map((seg, i) => {
        acc += "/" + seg;
        const last = i === segments.length - 1;
        return (
          <>
            <span class="slash">/</span>
            {last ? <span class="here">{seg}</span> : <a href={`${base}${encodeSegments(acc)}`}>{seg}</a>}
          </>
        );
      })}
    </nav>
  );
}
