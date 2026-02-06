import { Node } from "@xyflow/react";
import { Simulation, SimulationNodeDatum, forceCollide, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";

const simulationsDict: { [key: string]: Simulation<SimulationNodeDatum, undefined> } = {};
const tickCallbacks : any = {}

function runAllTickCallbacks() {
    Object.keys(tickCallbacks).forEach(name => {
        tickCallbacks[name]();
    })
}

export class LayoutUtils {

    static startSimulation(name : string, simulation : Simulation<SimulationNodeDatum, undefined>, onUpdateTick: () => void, maxTicks = 50) : Simulation<SimulationNodeDatum, undefined> {
        let ticks = 0;

        LayoutUtils.stopSimulation(name);

        simulationsDict[name] = simulation;

        tickCallbacks[name] = () => {
            if (ticks > maxTicks) {
                LayoutUtils.stopSimulation(name);
            }
            ticks++;
            onUpdateTick();
        }

        simulation.on('tick', runAllTickCallbacks);

        return simulation;
    }

    static stopSimulation(name : string) {
        if (simulationsDict[name]) {
            simulationsDict[name].stop();
            delete simulationsDict[name];
            delete tickCallbacks[name];
        }
    }

    static stopAllSimulations() {
        Object.keys(simulationsDict).forEach(name => {
            LayoutUtils.stopSimulation(name);
        })
    }

    static startNodeSimulation<T>(name: string, nodes : {data: T} & SimulationNodeDatum[], createSimulationCallback: (nodes: {data: T} & SimulationNodeDatum[]) => Simulation<SimulationNodeDatum, undefined>, setNodesCallback : (nodes: {data: T} & SimulationNodeDatum[]) => void, maxTicks = 50) {
        const simulation = createSimulationCallback(nodes);
        const onUpdateTick = () => {
            setNodesCallback(nodes);
        }
        LayoutUtils.startSimulation(name, simulation, onUpdateTick, maxTicks);
    }

    static getSimulation(name : string) : Simulation<SimulationNodeDatum, undefined> | null {
        return simulationsDict[name] || null;
    }

    static optimizeNodeLayout<T extends Record<string, unknown>>(name: string, flowNodes: Node<T>[], setNodesCallback: (flowNodes: Node<T>[]) => void, center: { x: number, y: number }, nodeRadius: number, maxTicks = 50): Simulation<SimulationNodeDatum, undefined> {

        let simulation = LayoutUtils.getSimulation(name);
        let nodes = null;

        // New simulation
        nodes = flowNodes.map(node => ({ id: node.id, x: node.position.x, y: node.position.y, data: node }));


        simulation = forceSimulation(nodes)
            .force("repel", forceManyBody().strength(-1000))
            .force("x", forceX(d => center.x - ((d as any)?.data?.measured?.width || 0)/2).strength(0.05)) // Take into account the width of the entity node
            .force("y", forceY(d => center.y - ((d as any)?.data?.measured?.height || 0)/2).strength(0.05)) // Take into account the height of the entity 
            .force("collide", forceCollide(nodeRadius)) as any;

        
        LayoutUtils.startSimulation(name, simulation!, () => {
            setNodesCallback([...flowNodes.map(node => {
                const simNode = nodes.find(n => (n as any).id === node.id);
                if (simNode) {
                    const x = (simNode as any).x;
                    const y = (simNode as any).y;

                    node.position = { x: x, y: y}
                }
                return {...node};
            })])
        }, maxTicks);

        return simulation!;
    }

}