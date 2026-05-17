import { registerRoot, continueRender, delayRender } from "remotion";
import { loadFont as loadLilitaOne } from "@remotion/google-fonts/LilitaOne";
import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { RemotionRoot } from "./Root";

// Google Fontları yükle - Lilita One (ana), Fredoka (fallback)
loadLilitaOne();
loadFredoka();

registerRoot(RemotionRoot);
