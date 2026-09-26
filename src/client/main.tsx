import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("缺少页面根节点");
createRoot(root).render(<App />);
