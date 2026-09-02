import { dataStatus, lastCommit, currentBranch } from "@/lib/admin/git";
import { CHECKS } from "@/lib/admin/checks";
import { ReviewPanel } from "@/components/admin/ReviewPanel";

/** What changed under packages/data, the checks that guard it, and a commit. */
export default async function AdminReview() {
  const [dirty, commit, branch] = await Promise.all([dataStatus(), lastCommit(), currentBranch()]);
  return <ReviewPanel dirty={dirty} commit={commit} branch={branch} checks={CHECKS.map((c) => c.name)} />;
}
