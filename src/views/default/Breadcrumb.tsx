// Path breadcrumb shared by the tree and blob views. Renders
// `name / ref / seg / seg ...` where every parent segment links back into the
// `/tree/` route and the final segment is plain text.
export function Breadcrumb(props: { name: string; ref: string; path: string }) {
  const segments = props.path.split("/").filter(Boolean);
  const base = `/${props.name}/tree/${props.ref}`;
  let acc = "";
  return (
    <nav class="breadcrumb">
      <a href={`${base}/`}>{props.name}</a>
      <span> / </span>
      <span>{props.ref}</span>
      {segments.map((seg, i) => {
        acc += "/" + seg;
        const last = i === segments.length - 1;
        return (
          <>
            <span> / </span>
            {last ? <span>{seg}</span> : <a href={`${base}${acc}`}>{seg}</a>}
          </>
        );
      })}
    </nav>
  );
}
