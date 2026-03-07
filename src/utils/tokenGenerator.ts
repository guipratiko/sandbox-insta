/**
 * Gera um token aleatório de 25 caracteres
 * Letras maiúsculas, minúsculas e números
 */

export const generateInstanceToken = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  
  for (let i = 0; i < 25; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return token;
};

/**
 * Gera um nome único de instância para Instagram
 */
export const generateInstanceName = (): string => {
  const prefix = 'insta_';
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  return `${prefix}${random}${timestamp}`;
};
