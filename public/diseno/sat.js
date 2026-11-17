// Datos fiscales del cliente (CFDI 4.0): catálogos del SAT y la validación de los datos obligatorios para registrarlo.
// Lo usan el formulario de Clientes del gestor y Pepito (guardar_cliente), así los dos piden y revisan lo mismo.
(function (raiz) {
  // c_RegimenFiscal: clave → [nombre, aplica a física, aplica a moral]
  const REGIMENES = {
    601: ['General de Ley Personas Morales', false, true],
    603: ['Personas Morales con Fines no Lucrativos', false, true],
    605: ['Sueldos y Salarios e Ingresos Asimilados a Salarios', true, false],
    606: ['Arrendamiento', true, false],
    607: ['Régimen de Enajenación o Adquisición de Bienes', true, false],
    608: ['Demás ingresos', true, false],
    610: ['Residentes en el Extranjero sin Establecimiento Permanente en México', true, true],
    611: ['Ingresos por Dividendos (socios y accionistas)', true, false],
    612: ['Personas Físicas con Actividades Empresariales y Profesionales', true, false],
    614: ['Ingresos por intereses', true, false],
    615: ['Régimen de los ingresos por obtención de premios', true, false],
    616: ['Sin obligaciones fiscales', true, false],
    620: ['Sociedades Cooperativas de Producción que optan por diferir sus ingresos', false, true],
    621: ['Incorporación Fiscal', true, false],
    622: ['Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', true, true],
    623: ['Opcional para Grupos de Sociedades', false, true],
    624: ['Coordinados', false, true],
    625: ['Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', true, false],
    626: ['Régimen Simplificado de Confianza', true, true]
  };
  // c_UsoCFDI más usados en una refaccionaria (más los de deducciones personales)
  const USOS_CFDI = {
    G01: 'Adquisición de mercancías', G02: 'Devoluciones, descuentos o bonificaciones', G03: 'Gastos en general',
    I01: 'Construcciones', I02: 'Mobiliario y equipo de oficina por inversiones', I03: 'Equipo de transporte', I04: 'Equipo de computo y accesorios',
    I05: 'Dados, troqueles, moldes, matrices y herramental', I06: 'Comunicaciones telefónicas', I07: 'Comunicaciones satelitales', I08: 'Otra maquinaria y equipo',
    D01: 'Honorarios médicos, dentales y gastos hospitalarios', D02: 'Gastos médicos por incapacidad o discapacidad', D03: 'Gastos funerales', D04: 'Donativos',
    D05: 'Intereses reales por créditos hipotecarios', D06: 'Aportaciones voluntarias al SAR', D07: 'Primas por seguros de gastos médicos',
    D08: 'Gastos de transportación escolar obligatoria', D09: 'Depósitos en cuentas para el ahorro', D10: 'Pagos por servicios educativos (colegiaturas)',
    S01: 'Sin efectos fiscales', CP01: 'Pagos', CN01: 'Nómina'
  };
  const RFC_GENERICOS = ['XAXX010101000', 'XEXX010101000'];
  const limpiaRfc = r => String(r || '').toUpperCase().replace(/[^A-ZÑ&0-9]/g, '');

  // Revisa los 7 datos obligatorios del póster: nombre o razón social, RFC, correo, tipo de persona, régimen fiscal,
  // dirección fiscal completa (calle, número, municipio o ciudad, estado y C.P.) y uso de CFDI.
  // c = { razonSocial, rfc, email, tipoPersona ('fisica'|'moral'), regimenFiscal, usoCfdi, calle, numeroExterior, municipio, ciudad, estado, codigoPostal }
  // Uso de CFDI S01 (Sin efectos fiscales): no se factura a su nombre, así que solo se pide el nombre; RFC, régimen y
  // dirección son opcionales (si los escriben, se revisan). Si algún día se le factura, CONTPAQi usa el RFC genérico.
  const SIN_EFECTOS = 'S01';
  function validarCliente(c) {
    const faltan = [], errores = [];
    const v = k => String((c && c[k]) || '').trim();
    if (v('usoCfdi').toUpperCase() === SIN_EFECTOS || (c && c.sinEfectosFiscales)) {
      if (!v('razonSocial')) faltan.push('nombre del cliente');
      const rfc = limpiaRfc(c && c.rfc);
      if (rfc && !RFC_GENERICOS.includes(rfc) && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) errores.push('El RFC ' + rfc + ' no tiene un formato válido (o déjalo vacío: es sin efectos fiscales).');
      const email = v('email');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errores.push('El correo ' + email + ' no es válido.');
      const cp = v('codigoPostal');
      if (cp && !/^\d{5}$/.test(cp)) errores.push('El código postal debe tener 5 dígitos.');
      const tipo = v('tipoPersona').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return { ok: !faltan.length && !errores.length, faltan, errores, sinEfectosFiscales: true,
        normalizado: { rfc, tipoPersona: ['fisica', 'moral'].includes(tipo) ? tipo : '', regimenFiscal: v('regimenFiscal').replace(/\D/g, ''), usoCfdi: SIN_EFECTOS, codigoPostal: cp } };
    }
    if (!v('razonSocial')) faltan.push('nombre completo o razón social');
    const rfc = limpiaRfc(c && c.rfc);
    if (!rfc) faltan.push('RFC');
    const email = v('email');
    if (!email) faltan.push('correo electrónico');
    const tipo = v('tipoPersona').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!tipo) faltan.push('tipo de persona (física o moral)');
    const regimen = v('regimenFiscal').replace(/\D/g, '');
    if (!regimen) faltan.push('régimen fiscal');
    if (!v('calle') || !v('numeroExterior')) faltan.push('calle y número');
    if (!v('municipio') && !v('ciudad')) faltan.push('municipio o alcaldía');
    if (!v('estado')) faltan.push('estado');
    const cp = v('codigoPostal');
    if (!cp) faltan.push('código postal');
    const uso = v('usoCfdi').toUpperCase();
    if (!uso) faltan.push('uso de CFDI');

    if (tipo && !['fisica', 'moral'].includes(tipo)) errores.push('El tipo de persona debe ser física o moral.');
    if (rfc && !RFC_GENERICOS.includes(rfc)) {
      if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) errores.push('El RFC ' + rfc + ' no tiene un formato válido (3 o 4 letras, fecha AAMMDD y homoclave).');
      else if (tipo === 'fisica' && rfc.length !== 13) errores.push('Una persona física lleva RFC de 13 caracteres; ' + rfc + ' tiene ' + rfc.length + '.');
      else if (tipo === 'moral' && rfc.length !== 12) errores.push('Una persona moral lleva RFC de 12 caracteres; ' + rfc + ' tiene ' + rfc.length + '.');
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errores.push('El correo ' + email + ' no es válido.');
    if (regimen) {
      const r = REGIMENES[regimen];
      if (!r) errores.push('El régimen fiscal ' + regimen + ' no está en el catálogo del SAT.');
      else if (tipo === 'fisica' && !r[1]) errores.push('El régimen ' + regimen + ' (' + r[0] + ') es de personas morales.');
      else if (tipo === 'moral' && !r[2]) errores.push('El régimen ' + regimen + ' (' + r[0] + ') es de personas físicas.');
    }
    if (cp && !/^\d{5}$/.test(cp)) errores.push('El código postal debe tener 5 dígitos.');
    if (uso && !USOS_CFDI[uso]) errores.push('El uso de CFDI ' + uso + ' no está en el catálogo del SAT.');
    return { ok: !faltan.length && !errores.length, faltan, errores, normalizado: { rfc, tipoPersona: tipo, regimenFiscal: regimen, usoCfdi: uso, codigoPostal: cp } };
  }
  const mensaje = r => (r.faltan.length ? 'Faltan: ' + r.faltan.join(', ') + '. ' : '') + r.errores.join(' ');

  const api = { REGIMENES, USOS_CFDI, SIN_EFECTOS, validarCliente, mensaje, limpiaRfc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.mayaSat = api;
})(typeof window !== 'undefined' ? window : globalThis);
