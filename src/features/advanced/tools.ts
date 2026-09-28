import { featureTools as commandTools } from "../commands/full/tools.js";
import { webpageTool } from "../webSearch/pageDefinition.js";
import { searchTool } from "../webSearch/definition.js";
export const featureTools = [...commandTools, searchTool, webpageTool];
