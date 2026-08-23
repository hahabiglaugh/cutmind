import { SegmentsWorkspace } from "@/components/segments-workspace";

export default async function ProjectPage(props: PageProps<"/project/[id]">) {
  const { id } = await props.params;
  return <SegmentsWorkspace projectId={id} />;
}
