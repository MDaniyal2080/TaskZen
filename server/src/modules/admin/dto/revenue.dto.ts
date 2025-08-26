import { ApiProperty } from "@nestjs/swagger";

export class RevenueMetricsDto {
  @ApiProperty({
    example: 199.8,
    description:
      "Estimated monthly recurring revenue (from Pro users count * monthly price)",
  })
  monthlyRecurringRevenue: number;

  @ApiProperty({
    example: 2397.6,
    description: "Projected yearly revenue (MRR * 12)",
  })
  yearlyProjection: number;

  @ApiProperty({ example: 20, description: "Number of users with Pro enabled" })
  totalProUsers: number;

  @ApiProperty({
    example: 180.5,
    description: "Average lifetime of pro customers in days",
  })
  averageCustomerLifetime: number;

  @ApiProperty({
    example: 5.2,
    description: "Churn rate calculated from expired Pro users (%)",
  })
  churnRate: number;
}

export class RevenueTransactionDto {
  @ApiProperty({ example: "txn_01HXTZ1ABCD" })
  id: string;

  @ApiProperty({ example: "user_cuid_123" })
  userId: string;

  @ApiProperty({ example: "user@example.com" })
  email: string;

  @ApiProperty({ example: "johndoe" })
  username: string;

  @ApiProperty({
    example: "Pro Monthly",
    description: "Plan name as stored in the Transaction.plan column",
  })
  plan: string;

  @ApiProperty({ example: 9.99 })
  amount: number;

  @ApiProperty({ example: "USD" })
  currency: string;

  @ApiProperty({
    example: "succeeded",
    description: "Lowercased string of Prisma enum TransactionStatus",
  })
  status: string;

  @ApiProperty({ example: "2024-06-21T10:30:00.000Z" })
  createdAt: string;
}

export class RevenueTransactionsResponseDto {
  @ApiProperty({ example: 150 })
  total: number;

  @ApiProperty({ type: [RevenueTransactionDto] })
  transactions: RevenueTransactionDto[];
}
