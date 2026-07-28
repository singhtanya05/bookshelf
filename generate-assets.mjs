import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
  console.log("Connecting to Mint MCP...");
  const transport = new SSEClientTransport(new URL("https://mcp.mint.gg/mcp"));
  const client = new Client(
    { name: "mint-asset-generator", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Connected.");
  
  const toolsResult = await client.listTools();
  console.log("Available tools:", toolsResult.tools.map(t => t.name).join(", "));
  
  const toolName = "generate_asset_pack";
  if (!toolsResult.tools.find(t => t.name === toolName)) {
    console.error(`Tool ${toolName} not found`);
    process.exit(1);
  }

  console.log(`Calling ${toolName}...`);
  const result = await client.callTool({
    name: toolName,
    arguments: {
      prompt: "A cohesive 19-piece library of varied clothbound hardcovers with distinct proportions, abstract foil motifs, and muted colors. Minimalist editorial style."
    }
  });

  console.log("Result:", JSON.stringify(result, null, 2));

  // The tool might return a manifest or an intermediate state.
  // Wait, generation might take a while, maybe we need to wait or poll?
  // Let's just write the result to a file and see.
  import('fs').then(fs => {
    fs.writeFileSync('mint-generation-result.json', JSON.stringify(result, null, 2));
    console.log("Wrote result to mint-generation-result.json");
    process.exit(0);
  });
}

main().catch(console.error);
