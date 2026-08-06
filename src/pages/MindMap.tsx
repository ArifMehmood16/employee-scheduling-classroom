import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Braces, Filter } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  KIND_META,
  MAP_EDGES,
  MAP_NODES,
  type MapNode,
  type NodeKind,
} from "@/content/mindmap";

/**
 * The codebase as a zoomable graph.
 *
 * Node colours here identify a LAYER, which is a categorical encoding — so they use the
 * validated categorical slots in fixed order, and every node also carries a text label
 * for its layer in the legend and in the detail panel. Nothing relies on hue alone.
 */

function LayerNode({ data, selected }: NodeProps) {
  const node = data.node as MapNode;
  const meta = KIND_META[node.kind];
  const dimmed = data.dimmed as boolean;

  return (
    <div
      className={cn(
        "w-[188px] rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-all",
        selected && "ring-2 ring-primary",
        dimmed && "opacity-25",
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: meta.color }}
    >
      <Handle type="target" position={Position.Left} id="tl" />
      <Handle type="target" position={Position.Top} id="tt" />
      <Handle type="target" position={Position.Bottom} id="tb" />
      <div className="truncate text-[13px] font-medium leading-tight">{node.label}</div>
      {node.sublabel ? (
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {node.sublabel}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} id="sr" />
      <Handle type="source" position={Position.Top} id="st" />
      <Handle type="source" position={Position.Bottom} id="sb" />

    </div>
  );
}

const NODE_TYPES = { layer: LayerNode };

const POSITIONS: Record<string, { x: number; y: number }> = Object.fromEntries(
  MAP_NODES.map((node) => [node.id, { x: node.x, y: node.y }]),
);


export default function MindMap() {
  return (
    <ReactFlowProvider>
      <MindMapInner />
    </ReactFlowProvider>
  );
}

function MindMapInner() {
  const [selectedId, setSelectedId] = useState<string>("planningVariable");
  const [activeKinds, setActiveKinds] = useState<Set<NodeKind>>(
    () => new Set(Object.keys(KIND_META) as NodeKind[]),
  );

  const selected = MAP_NODES.find((node) => node.id === selectedId) ?? MAP_NODES[0];

  const neighbours = useMemo(() => {
    const set = new Set<string>([selectedId]);
    for (const edge of MAP_EDGES) {
      if (edge.source === selectedId) set.add(edge.target);
      if (edge.target === selectedId) set.add(edge.source);
    }
    return set;
  }, [selectedId]);

  const nodes = useMemo<Node[]>(
    () =>
      MAP_NODES.map((node) => ({
        id: node.id,
        type: "layer",
        position: { x: node.x, y: node.y },
        selected: node.id === selectedId,
        data: { node, dimmed: !activeKinds.has(node.kind) },
      })),
    [selectedId, activeKinds],
  );

  const edges = useMemo<Edge[]>(
    () =>
      MAP_EDGES.map((edge, index) => {
        const highlighted = edge.source === selectedId || edge.target === selectedId;
        const from = POSITIONS[edge.source];
        const to = POSITIONS[edge.target];
        // Left→right whenever the target really is downstream; otherwise route
        // vertically so a backwards edge does not double back over its own row.
        const forward = to.x > from.x + 40;
        const sourceHandle = forward ? "sr" : to.y >= from.y ? "sb" : "st";
        const targetHandle = forward ? "tl" : to.y >= from.y ? "tt" : "tb";
        return {
          id: `e${index}`,
          source: edge.source,
          target: edge.target,
          sourceHandle,
          targetHandle,
          label: edge.label,
          type: "smoothstep",

          animated: highlighted,
          zIndex: highlighted ? 2 : 0,
          pathOptions: { borderRadius: 14 },
          style: {
            stroke: highlighted ? "var(--series-1)" : "hsl(var(--border))",
            strokeWidth: highlighted ? 2 : 1,
            strokeDasharray: edge.dashed ? "5 4" : undefined,
          },
          labelStyle: {
            fontSize: 10,
            fill: highlighted ? "hsl(var(--foreground))" : "var(--viz-ink-muted)",
          },
          labelShowBg: true,
          labelBgPadding: [5, 3] as [number, number],
          labelBgBorderRadius: 4,
          labelBgStyle: {
            fill: "hsl(var(--card))",
            stroke: "hsl(var(--border))",
            strokeWidth: 1,
          },
        };
      }),
    [selectedId],
  );

  const toggleKind = useCallback((kind: NodeKind) => {
    setActiveKinds((previous) => {
      const next = new Set(previous);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Mindmap"
        title="The whole quickstart on one canvas"
        lead="Left to right: data in, model, score, search, service. Click any node for the explanation; the highlighted edges are its direct relationships. The vertical column of eight is the constraint set — and their being a column rather than a chain is itself the point: they are independent of each other."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Filter className="h-3 w-3" /> Layers
            </span>
            {(Object.entries(KIND_META) as Array<[NodeKind, { label: string; color: string }]>).map(
              ([kind, meta]) => {
                const active = activeKinds.has(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleKind(kind)}
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] transition-opacity",
                      active ? "opacity-100" : "opacity-40",
                    )}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: meta.color }}
                      aria-hidden
                    />
                    {meta.label}
                  </button>
                );
              },
            )}
          </div>
          <div className="h-[520px] sm:h-[640px] xl:h-[760px]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              fitView
              fitViewOptions={{ padding: 0.08 }}
              minZoom={0.2}
              maxZoom={1.6}
              nodesDraggable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="hsl(var(--border))" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base">{selected.label}</CardTitle>
                  {selected.sublabel ? (
                    <CardDescription className="font-mono text-[11px]">
                      {selected.sublabel}
                    </CardDescription>
                  ) : null}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {KIND_META[selected.kind].label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-relaxed text-muted-foreground">{selected.detail}</p>

              <div className="flex flex-wrap gap-2">
                {selected.javaFile ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/code?file=${selected.javaFile}`}>
                      <Braces /> Read the Java
                    </Link>
                  </Button>
                ) : null}
                {selected.route ? (
                  <Button asChild size="sm">
                    <Link to={selected.route}>{selected.routeLabel ?? "Open"}</Link>
                  </Button>
                ) : null}
                {selected.external ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={selected.external.url} target="_blank" rel="noreferrer">
                      {selected.external.label} <ArrowUpRight />
                    </a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Connected to</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {MAP_EDGES.filter(
                (edge) => edge.source === selectedId || edge.target === selectedId,
              ).map((edge, index) => {
                const otherId = edge.source === selectedId ? edge.target : edge.source;
                const other = MAP_NODES.find((node) => node.id === otherId);
                if (!other) return null;
                const outgoing = edge.source === selectedId;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setSelectedId(otherId)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary"
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-sm"
                      style={{ background: KIND_META[other.kind].color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">{other.label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {outgoing ? "→" : "←"} {edge.label ?? ""}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
