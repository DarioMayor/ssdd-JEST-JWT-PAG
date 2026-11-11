// Variables de entorno para los tests e2e
process.env.JWT_SECRET ??= 'secreto-para-pruebas-e2e-con-mas-de-32-bytes';
process.env.JWT_TTL ??= '15m';
process.env.JWT_ISSUER ??= 'https://biblioteca.uni.edu';
