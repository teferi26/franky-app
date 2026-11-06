export const HOUSING_STAGES={new:'Nuevo',contacted:'Contactado',shortlisted:'Preseleccionado',negotiating:'En negociación',won:'Alquiler acordado',lost:'No continúa'} as const;
export type HousingStage=keyof typeof HOUSING_STAGES;
export type HousingFunnel={period:string;demo:boolean;views:number;contacts:number;visits_requested:number;visits_confirmed:number;visits_completed:number;won:number;lost:number;conversion_percent:number|null;response_minutes:number|null;responded_conversations:number;awaiting_response:number;definition:string};
