export interface Note { id: string; title: string; content: string; createdAt: number; updatedAt: number }
export interface Board { id: string; name: string; panX: number; panY: number; zoom: number; updatedAt: number }
export interface MindNode { id: string; boardId: string; text: string; x: number; y: number; createdAt: number; updatedAt: number }
export interface MindEdge { id: string; boardId: string; sourceId: string; targetId: string }
