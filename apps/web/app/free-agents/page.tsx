import { permanentRedirect } from "next/navigation";

/**
 * Free agency folded into the main offseason board — signing lives inside each
 * team column now. From a team page, "Sign FAs →" deep-links to /?sign=<TEAM>,
 * which opens the board with that team's signing drawer up.
 */
export default function FreeAgentsPage() {
  permanentRedirect("/");
}
