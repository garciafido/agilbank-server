import {
  PrismaClient,
  User,
  Product,
  Order,
  OrderItem,
  Tenant,
} from "../../prisma-test/client";
import { TestContext } from "../types/context";
import {
  UserWithFullStructure,
  ProductWithOrderItems,
  ComplexStructure,
  ProductWithOrder,
} from "../types/prisma-types";

export class PrismaHelper {
  constructor(public prisma: PrismaClient, private isSecure: boolean = false) {}

  private addTenantConnection(data: any, context: TestContext): any {
    return {
      ...data,
      tenant: {
        connect: { id: context.currentUser.tenantId },
      },
    };
  }

  private addTenantToNestedCreate(data: any, context: TestContext): any {
    const result = { ...data };

    // Agregar tenant connection al objeto principal
    result.tenant = {
      connect: { id: context.currentUser.tenantId },
    };

    // Procesar órdenes si existen
    if (result.orders?.create) {
      result.orders.create = Array.isArray(result.orders.create)
        ? result.orders.create.map((order: any) => ({
            ...order,
            tenant: {
              connect: { id: context.currentUser.tenantId },
            },
            items: order.items && {
              create: order.items.create.map((item: any) => ({
                ...item,
                tenant: {
                  connect: { id: context.currentUser.tenantId },
                },
                product: item.product && {
                  create: {
                    ...item.product.create,
                    tenant: {
                      connect: { id: context.currentUser.tenantId },
                    },
                  },
                },
              })),
            },
          }))
        : {
            ...result.orders.create,
            tenant: {
              connect: { id: context.currentUser.tenantId },
            },
          };
    }

    return result;
  }

  async findUserWithFullStructure(
    id: string,
    context: TestContext
  ): Promise<UserWithFullStructure | null> {
    const where =
      context.hasRole("SUPER_ADMIN") || !this.isSecure
        ? { id }
        : { id, tenantId: context.currentUser.tenantId };

    return this.prisma.user.findFirst({
      where,
      include: {
        orders: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });
  }

  async createUser(data: any, context: TestContext): Promise<User> {
    const processedData = this.addTenantConnection(data, context);
    return this.prisma.user.create({
      data: processedData,
    });
  }

  async findManyProducts(
    where: any = {},
    context: TestContext
  ): Promise<Product[]> {
    if (context.hasRole("SUPER_ADMIN") || !this.isSecure) {
      return this.prisma.product.findMany({ where });
    }

    return this.prisma.product.findMany({
      where: {
        ...where,
        tenantId: context.currentUser.tenantId,
      },
    });
  }

  async createProduct(data: any, context: TestContext): Promise<Product> {
    const processedData = this.addTenantConnection(data, context);
    return this.prisma.product.create({
      data: processedData,
    });
  }

  async createComplexUserStructure(
    data: any,
    context: TestContext
  ): Promise<UserWithFullStructure> {
    const userData = {
      email: data.email,
      name: data.name,
      orders: data.orders && {
        create: data.orders.map((order: any) => ({
          status: order.status,
          items: {
            create: order.items.map((item: any) => ({
              quantity: item.quantity,
              product: {
                create: {
                  ...item.product,
                },
              },
            })),
          },
        })),
      },
    };

    const processedData = this.addTenantToNestedCreate(userData, context);

    return this.prisma.user.create({
      data: processedData,
      include: {
        orders: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });
  }

  async createInterconnectedStructure(
    data: any,
    context: TestContext
  ): Promise<ComplexStructure> {
    // Crear usuarios con tenant
    const users = await Promise.all(
      data.users.map((userData: any) => this.createUser(userData, context))
    );

    // Crear productos con tenant
    const products = await Promise.all(
      data.products.map((productData: any) =>
        this.createProduct(productData, context)
      )
    );

    // Crear órdenes con tenant
    const orders = await Promise.all(
      data.orders.map(async (orderInput: any, index: number) => {
        const createOrderData = {
          status: orderInput.status || "PENDING",
          tenant: {
            connect: { id: context.currentUser.tenantId },
          },
          user: {
            connect: { id: users[index % users.length].id },
          },
          items: {
            create: products.map((product) => ({
              quantity: 1,
              price: product.price,
              tenant: {
                connect: { id: context.currentUser.tenantId },
              },
              product: {
                connect: { id: product.id },
              },
            })),
          },
        };

        return this.prisma.order.create({
          data: createOrderData,
          include: {
            user: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        });
      })
    );

    return { users, products, orders };
  }

  async createTenant(data: {
    name: string;
    subdomain: string;
  }): Promise<Tenant> {
    return this.prisma.tenant.create({ data });
  }

  async createManyProductsWithOrders(
    data: any[],
    context: TestContext
  ): Promise<ProductWithOrder[]> {
    return Promise.all(
      data.map(async (item) => {
        const product = await this.createProduct(item.product, context);
        const user = await this.createUser(item.order.user, context);

        const order = await this.prisma.order.create({
          data: {
            status: "PENDING",
            tenant: {
              connect: { id: context.currentUser.tenantId },
            },
            user: {
              connect: { id: user.id },
            },
          },
        });

        await this.prisma.orderItem.create({
          data: {
            quantity: item.order.quantity,
            price: item.product.price,
            tenant: {
              connect: { id: context.currentUser.tenantId },
            },
            product: {
              connect: { id: product.id },
            },
            order: {
              connect: { id: order.id },
            },
          },
        });

        const completedOrder = await this.prisma.order.findUnique({
          where: { id: order.id },
          include: {
            user: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        return {
          product,
          order: completedOrder as Order & {
            user: User;
            items: (OrderItem & {
              product: Product;
            })[];
          },
        };
      })
    );
  }

  async updateProductWithOrders(
    id: string,
    data: any,
    context: TestContext
  ): Promise<ProductWithOrderItems> {
    // En modo seguro aplicamos el filtro de tenant, en modo inseguro solo usamos el id
    const where = this.isSecure
      ? { id, tenantId: context.currentUser.tenantId }
      : { id };

    const product = await this.prisma.product.update({
      where,
      data: {
        price: data.price,
      },
    });

    if (data.orders?.create) {
      for (const orderData of data.orders.create) {
        // Crear el usuario (ahora siempre lo creamos ya que es requerido)
        const user = await this.prisma.user.create({
          data: {
            ...(orderData.user?.create || {
              email: `order-user-${Date.now()}@example.com`,
              name: "Order User",
            }),
            tenant: {
              connect: { id: context.currentUser.tenantId },
            },
          },
        });

        // Crear la orden con el usuario conectado
        const order = await this.prisma.order.create({
          data: {
            status: orderData.status || "PENDING",
            tenant: {
              connect: { id: context.currentUser.tenantId },
            },
            user: {
              connect: { id: user.id },
            },
          },
        });

        // Crear los items de la orden
        if (orderData.items?.create) {
          await this.prisma.orderItem.createMany({
            data: orderData.items.create.map((item: any) => ({
              quantity: item.quantity,
              price: item.price || 0,
              orderId: order.id,
              productId: product.id,
              tenantId: context.currentUser.tenantId,
            })),
          });
        }
      }
    }

    // Retornar el producto con su estructura completa
    return this.prisma.product.findUnique({
      where: { id: product.id },
      include: {
        orderItems: {
          include: {
            order: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    }) as Promise<ProductWithOrderItems>;
  }
}
