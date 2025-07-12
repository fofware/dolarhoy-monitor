export interface IGastosCmp {
  emisor: string;
  cliente_id: string;
  periodo?: string;
  tipo: string;
  comprobante: string;
  vencimiento: Date;
  importe: number;
  raw_data: string;
  vale: number;
}