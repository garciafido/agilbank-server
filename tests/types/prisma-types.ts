import { User, Product, Order, OrderItem } from "../../prisma-test/client";

export interface UserWithFullStructure extends User {
  orders?: (Order & {
    items?: (OrderItem & {
      product?: Product;
    })[];
  })[];
}

export interface ProductWithOrderItems extends Product {
  orderItems?: (OrderItem & {
    order?: Order & {
      user?: User;
    };
  })[];
}

export interface ProductWithOrder {
  product: Product;
  order: Order & {
    user: User;
    items: (OrderItem & {
      product: Product;
    })[];
  };
}

export interface ComplexStructure {
  users: User[];
  products: Product[];
  orders: (Order & {
    user: User;
    items: (OrderItem & {
      product: Product;
    })[];
  })[];
}
