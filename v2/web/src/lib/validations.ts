import { z } from "zod";

export const reportSchema = z.object({
  reported_user_id: z.string().uuid("ID de usuario no válido"),
  context: z.enum(["profile", "chat", "comment", "accommodation", "other"], {
    error: "Contexto no válido",
  }),
  reason: z
    .string()
    .min(3, "El motivo debe tener al menos 3 caracteres")
    .max(500, "El motivo no puede superar los 500 caracteres")
    .trim(),
});

export const createPropietarioSchema = z.object({
  email: z.string().email("Email no válido").max(320),
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "Nombre demasiado largo")
    .trim(),
  // Cuentas de equipo que el admin puede crear desde el panel. 'analyst' ve
  // todo el panel en solo lectura; 'admin' jamás se crea por esta vía.
  role: z.enum(["propietario", "analyst"]).default("propietario"),
});

export const onboardingSchema = z.object({
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida").optional().nullable(),
  gender: z.enum(["Hombre", "Mujer", "No binario", "Prefiero no decirlo"]).optional().nullable(),
  comunidad_autonoma: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  is_student: z.boolean().optional().nullable(),
  student_type: z.enum(["bachillerato", "fp", "universidad", "master", "otro"]).optional().nullable(),
  bachillerato_course: z.enum(["1", "2"]).optional().nullable(),
  bachillerato_modality: z.string().max(100).optional().nullable(),
  fp_study: z.string().max(200).optional().nullable(),
  university_id: z.string().uuid().optional().nullable(),
  university_course: z.number().int().min(1).max(6).optional().nullable(),
  master_study: z.string().max(200).optional().nullable(),
  knows_desired_career: z.boolean().optional().nullable(),
  desired_career_id: z.string().uuid().optional().nullable(),
  desired_city: z.string().max(100).optional().nullable(),
  study_anywhere: z.boolean().optional().nullable(),
  looking_for_housing: z.boolean().optional().nullable(),
  looking_for_roommate: z.boolean().optional().nullable(),
  smoking: z.boolean().optional().nullable(),
  partying: z.string().max(50).optional().nullable(),
  sleep_schedule: z.string().max(50).optional().nullable(),
  cleanliness: z.number().int().min(1).max(5).optional().nullable(),
  disorder_tolerance: z.number().int().min(1).max(5).optional().nullable(),
  noise_tolerance: z.string().max(50).optional().nullable(),
  home_gatherings: z.boolean().optional().nullable(),
  is_homebody: z.boolean().optional().nullable(),
  is_early_riser: z.boolean().optional().nullable(),
  pet_friendly: z.boolean().optional().nullable(),
  accepts_different_gender_roommate: z.boolean().optional().nullable(),
  diet: z.string().max(50).optional().nullable(),
  hobbies: z.array(z.string().max(50)).max(20).optional().nullable(),
  budget_min: z.number().min(0).max(10000).optional().nullable(),
  budget_max: z.number().min(0).max(10000).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  onboarding_completed: z.literal(true),
});
