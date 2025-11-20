
export interface CompanyData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  cnae_fiscal_descricao: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
}

export async function fetchCompanyData(cnpj: string): Promise<CompanyData | null> {
  // Remove caracteres não numéricos
  const cleanCnpj = cnpj.replace(/\D/g, '');

  if (cleanCnpj.length !== 14) {
    return null;
  }

  try {
    // Utilizando BrasilAPI que é gratuita e não requer chave para consultas básicas
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`CNPJ ${cleanCnpj} não encontrado na base de dados.`);
      }
      return null;
    }

    const data = await response.json();
    
    return {
      cnpj: data.cnpj,
      razao_social: data.razao_social,
      nome_fantasia: data.nome_fantasia,
      situacao_cadastral: data.descricao_situacao_cadastral,
      cnae_fiscal_descricao: data.cnae_fiscal_descricao,
      logradouro: data.logradouro,
      numero: data.numero,
      bairro: data.bairro,
      municipio: data.municipio,
      uf: data.uf
    };
  } catch (error) {
    console.error("Erro ao buscar dados do CNPJ:", error);
    return null;
  }
}
