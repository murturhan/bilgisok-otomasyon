import { registerRoot } from "remotion";
import { loadFont as loadLilita } from "@remotion/google-fonts/LilitaOne";
import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { RemotionRoot } from "./Root";

loadLilita();
loadFredoka();

registerRoot(RemotionRoot);
