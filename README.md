# UniBridge

> El puente entre formación y experiencia.

UniBridge es una plataforma web moderna diseñada para centralizar, automatizar y optimizar la gestión de prácticas preprofesionales entre universidades, estudiantes y empresas.

El sistema permite administrar estudiantes, tutores académicos, instituciones, documentos y procesos administrativos desde una única plataforma intuitiva, moderna y escalable.

---

# ✨ Características

* 📚 Gestión de prácticas preprofesionales
* 👨‍🎓 Administración de estudiantes
* 🏢 Gestión de empresas e instituciones
* 👨‍🏫 Asignación de tutores académicos
* 📄 Generación automática de documentos Word/PDF
* ⏱️ Control y seguimiento de horas prácticas
* 🔍 Búsqueda y filtros inteligentes
* 📊 Dashboard administrativo moderno
* 📂 Agrupación dinámica por empresa
* 📱 Interfaz responsiva y optimizada
* ⚡ Flujo administrativo automatizado

---

# 🎯 Objetivo

UniBridge busca transformar los procesos tradicionales y manuales de gestión académica en una experiencia digital moderna, organizada y eficiente.

La plataforma conecta:

* universidades,
* estudiantes,
* docentes,
* y empresas

mediante herramientas tecnológicas que simplifican la coordinación, documentación y seguimiento de prácticas preprofesionales.

---

# 🖥️ Tecnologías

## Frontend

* Next.js
* React
* TypeScript
* TailwindCSS
* shadcn/ui
* TanStack Table
* Framer Motion

## Backend

* NestJS
* PostgreSQL
* Prisma ORM
* JWT Authentication

## Documentos

* Docxtemplater
* PDF Generation
* Automatización de plantillas

---

# 📂 Estructura del Proyecto

```bash
unibridge/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── ui/
│   ├── types/
│   └── config/
│
├── docs/
├── prisma/
└── README.md
```

---

# 🚀 Instalación

## 1. Clonar repositorio

```bash
git clone https://github.com/tuusuario/unibridge.git
```

## 2. Instalar dependencias

```bash
npm install
```

## 3. Configurar variables de entorno

Crear archivo:

```bash
.env
```

Ejemplo:

```env
DATABASE_URL=
JWT_SECRET=
NEXT_PUBLIC_API_URL=
```

---

# ▶️ Ejecutar proyecto

## Frontend

```bash
npm run dev
```

## Backend

```bash
npm run start:dev
```

---

# 📄 Generación de documentos

UniBridge permite generar automáticamente:

* oficios,
* solicitudes,
* reportes,
* certificados,
* documentos institucionales,

mediante plantillas dinámicas `.docx`.

Variables soportadas:

```text
{{studentName}}
{{companyName}}
{{academicTutor}}
{{totalHours}}
```

Bucles dinámicos:

```text
{#students}
{/students}
```

Porque claramente escribir oficios manualmente en Word durante horas era una excelente estrategia evolutiva administrativa.

---

# 🎨 Diseño UX/UI

La interfaz está inspirada en productos modernos como:

* Linear
* Notion
* Stripe Dashboard
* Vercel
* Airtable

Priorizando:

* claridad visual,
* reducción de ruido,
* accesibilidad,
* velocidad de uso,
* y experiencia administrativa moderna.

---

# 🔐 Roles del Sistema

* Administrador
* Coordinador académico
* Tutor académico
* Estudiante

---

# 📈 Roadmap

* [ ] Firma electrónica
* [ ] Notificaciones en tiempo real
* [ ] Dashboard analítico avanzado
* [ ] Gestión móvil
* [ ] Integración institucional
* [ ] Exportación avanzada
* [ ] Automatización IA documental

---

# 🤝 Contribuciones

Las contribuciones son bienvenidas.

1. Fork del proyecto
2. Crear rama:

```bash
git checkout -b feature/nueva-funcionalidad
```

3. Commit:

```bash
git commit -m "feat: nueva funcionalidad"
```

4. Push:

```bash
git push origin feature/nueva-funcionalidad
```

5. Crear Pull Request

---

# 📜 Licencia

MIT License

---

# 👨‍💻 Autor

Desarrollado con café, automatización y una leve frustración hacia los procesos administrativos manuales.

**UniBridge**
Gestión moderna de prácticas preprofesionales.
