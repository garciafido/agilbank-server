// Generado desde prisma/schema.prisma: las restricciones de unicidad de cada
// tabla, con las etiquetas de la entidad y de sus campos. Lo usa PrismaError
// para decir qué campo chocó. No editar: se rehace en cada regeneración.
import type { UniqueConstraintsData } from "./uniqueViolation";

export const UNIQUE_CONSTRAINTS: UniqueConstraintsData = {
  defaultLanguage: "es",
  tables: {
    ab_statement: {
      model: "AbStatement",
      labels: {
        es: {
          s: "Extracto Bancario",
          g: "M",
        },
      },
      columns: {
        tenant__id__: null,
        content_hash: ["contentHash"],
      },
      constraints: {
        ab_statement_tenant__id___content_hash_key: ["contentHash"],
      },
      fieldLabels: {
        contentHash: {
          es: {
            s: "Huella del Archivo",
            g: "F",
          },
        },
      },
    },
    ab_reconciliation: {
      model: "AbReconciliation",
      labels: {
        es: {
          s: "Conciliación",
          g: "F",
        },
      },
      columns: {
        tenant__id__: null,
        request_key: ["requestKey"],
      },
      constraints: {
        ab_reconciliation_tenant__id___request_key_key: ["requestKey"],
      },
      fieldLabels: {
        requestKey: {
          es: {
            s: "Clave del Pedido",
            g: "F",
          },
        },
      },
    },
    ab_payment_batch: {
      model: "AbPaymentBatch",
      labels: {
        es: {
          s: "Lote de Pagos",
          g: "M",
        },
      },
      columns: {
        tenant__id__: null,
        content_hash: ["contentHash"],
      },
      constraints: {
        ab_payment_batch_tenant__id___content_hash_key: ["contentHash"],
      },
      fieldLabels: {
        contentHash: {
          es: {
            s: "Huella del Archivo",
            g: "F",
          },
        },
      },
    },
    ab_decision: {
      model: "AbDecision",
      labels: {
        es: {
          s: "Decisión",
          g: "F",
        },
      },
      columns: {
        tenant__id__: null,
        decision_key: ["decisionKey"],
      },
      constraints: {
        ab_decision_tenant__id___decision_key_key: ["decisionKey"],
      },
      fieldLabels: {
        decisionKey: {
          es: {
            s: "Clave",
            g: "F",
          },
        },
      },
    },
    user: {
      model: "User",
      labels: {
        en: {
          s: "User",
          g: "M",
        },
        es: {
          s: "Usuario",
          g: "M",
        },
        pt: {
          s: "Usuário",
          g: "M",
        },
      },
      columns: {
        email: ["email"],
      },
      constraints: {
        user_email_key: ["email"],
      },
      fieldLabels: {
        email: {
          en: {
            s: "Email",
          },
          es: {
            s: "Email",
          },
          pt: {
            s: "Email",
          },
        },
      },
    },
    role: {
      model: "Role",
      labels: {
        en: {
          s: "Role",
          g: "M",
        },
        es: {
          s: "Rol",
          g: "M",
        },
        pt: {
          s: "Papel",
          g: "F",
        },
      },
      columns: {
        tenant__id__: null,
        name: ["name"],
      },
      constraints: {
        role_tenant__id___name_key: ["name"],
      },
      fieldLabels: {
        name: {
          en: {
            s: "Name",
          },
          es: {
            s: "Nombre",
          },
          pt: {
            s: "Nome",
          },
        },
      },
    },
    permission: {
      model: "Permission",
      labels: {
        en: {
          s: "Permission",
          g: "M",
        },
        es: {
          s: "Permiso",
          g: "M",
        },
        pt: {
          s: "Permisão",
          g: "M",
        },
      },
      columns: {
        name: ["name"],
      },
      constraints: {
        permission_name_key: ["name"],
      },
      fieldLabels: {
        name: {
          en: {
            s: "Name",
          },
          es: {
            s: "Nombre",
          },
          pt: {
            s: "Nome",
          },
        },
      },
    },
    tenant: {
      model: "Tenant",
      labels: {
        es: {
          s: "Empresa",
          g: "F",
        },
      },
      columns: {
        name: ["name"],
      },
      constraints: {
        tenant_name_key: ["name"],
      },
      fieldLabels: {
        name: {
          es: {
            s: "Nombre",
            g: "M",
          },
        },
      },
    },
    integration_client: {
      model: "IntegrationClient",
      labels: {
        es: {
          s: "Sistema Cliente",
          g: "M",
        },
        en: {
          s: "Integration Client",
          g: "M",
        },
        pt: {
          s: "Sistema Cliente",
          g: "M",
        },
      },
      columns: {
        tenant__id__: null,
        name: ["name"],
      },
      constraints: {
        integration_client_tenant__id___name_key: ["name"],
      },
      fieldLabels: {
        name: {
          es: {
            s: "Nombre",
            g: "M",
          },
          en: {
            s: "Name",
            g: "M",
          },
          pt: {
            s: "Nome",
            g: "M",
          },
        },
      },
    },
    idempotency_record: {
      model: "IdempotencyRecord",
      labels: {
        es: {
          s: "Operación por API",
          g: "F",
        },
        en: {
          s: "API Operation",
          g: "F",
        },
        pt: {
          s: "Operação por API",
          g: "F",
        },
      },
      columns: {
        tenant__id__: null,
        client: ["client"],
        key: ["key"],
      },
      constraints: {
        idempotency_record_tenant__id___client_key_key: ["client", "key"],
      },
      fieldLabels: {
        client: {
          es: {
            s: "Sistema",
            g: "M",
          },
          en: {
            s: "Client",
            g: "M",
          },
          pt: {
            s: "Sistema",
            g: "M",
          },
        },
        key: {
          es: {
            s: "Clave",
            g: "F",
          },
          en: {
            s: "Key",
            g: "F",
          },
          pt: {
            s: "Chave",
            g: "F",
          },
        },
      },
    },
    email_verification: {
      model: "EmailVerification",
      labels: {
        es: {
          s: "Verificación de Email",
          g: "F",
        },
      },
      columns: {
        tenant__id__: null,
        email: ["email"],
      },
      constraints: {
        email_verification_tenant__id___email_key: ["email"],
      },
      fieldLabels: {
        email: {
          es: {
            s: "Email",
          },
        },
      },
    },
  },
};
