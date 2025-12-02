
export interface NcmResponse {
  codigo: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  tipo_ato: string;
  numero_ato: string;
  ano_ato: string;
}

export async function fetchNcmData(ncmCode: string): Promise<NcmResponse | null> {
  const cleanCode = ncmCode.replace(/\D/g, '');
  
  // Basic validation: 8 digits
  if (cleanCode.length !== 8) return null;

  try {
    const response = await fetch(`https://brasilapi.com.br/api/ncm/v1/${cleanCode}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`NCM ${cleanCode} not found in BrasilAPI.`);
      }
      return null;
    }

    const data = await response.json();
    return data as NcmResponse;
  } catch (error) {
    console.error(`Error fetching NCM ${cleanCode}:`, error);
    return null;
  }
}
