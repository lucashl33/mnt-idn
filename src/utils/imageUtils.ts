/**
 * Utilitário para compressão de imagens antes do armazenamento.
 * Usa Canvas API do browser para redimensionar e comprimir.
 */

const MAX_WIDTH = 800;
const MAX_HEIGHT = 800;
const JPEG_QUALITY = 0.6;

/**
 * Comprime uma imagem File para uma string base64 (data URL).
 * - Redimensiona para no máximo 800x800px mantendo a proporção
 * - Converte para JPEG com qualidade 60%
 * - Resultado típico: 30KB-100KB em vez de 2-5MB
 * 
 * @param file - O arquivo de imagem selecionado pelo usuário
 * @returns Uma string base64 (data:image/jpeg;base64,...) pronta para salvar no Firestore
 */
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        try {
          // Calcular dimensões mantendo proporção
          let { width, height } = img;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }

          // Criar canvas e desenhar imagem redimensionada
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Não foi possível criar contexto do canvas'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Converter para JPEG base64 com compressão
          const base64 = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          resolve(base64);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Erro ao carregar a imagem para compressão'));
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Erro ao ler o arquivo de imagem'));
    };

    reader.readAsDataURL(file);
  });
}
