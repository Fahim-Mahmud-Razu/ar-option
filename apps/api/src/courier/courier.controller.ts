import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { CourierService } from './courier.service';
import { ShopGuard } from '../shops/shop.guard';
import {
  BookCourierParcelDto,
  UpdateParcelDeliveryDto,
  CreateSettlementDto,
  CourierParcel,
  CourierSettlement,
  CourierDeliveryStatus,
  CourierPaymentStatus,
} from '@ar-option/shared-types';

@Controller('courier')
export class CourierController {
  constructor(private readonly courierService: CourierService) {}

  @Get('summary')
  async getCourierSummary(
    @Query('shop_id') shopId?: string
  ): Promise<{
    money_with_couriers: number;
    delivered_unpaid_count: number;
    out_now_count: number;
    returned_count: number;
  }> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    return this.courierService.getCourierSummary(sId);
  }

  @Get('parcels')
  async listParcels(
    @Query('shop_id') shopId?: string,
    @Query('delivery_status') deliveryStatus?: CourierDeliveryStatus,
    @Query('payment_status') paymentStatus?: CourierPaymentStatus,
    @Query('filter') filter?: string
  ): Promise<CourierParcel[]> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    return this.courierService.listParcels(sId, deliveryStatus, paymentStatus, filter);
  }

  @Get('parcels/:id')
  async getParcel(@Param('id', ParseIntPipe) id: number): Promise<CourierParcel> {
    return this.courierService.getParcelById(id);
  }

  @Post('parcels/book')
  @UseGuards(ShopGuard)
  async bookParcel(
    @Body() body: BookCourierParcelDto,
    @Req() req: any
  ): Promise<CourierParcel> {
    return this.courierService.bookParcel(body, req.shopId, req.user);
  }

  @Post('parcels/:id/delivery-status')
  async updateDeliveryStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateParcelDeliveryDto,
    @Req() req: any
  ): Promise<CourierParcel> {
    return this.courierService.updateParcelDelivery(id, body, req.user);
  }

  @Get('settlements')
  async listSettlements(): Promise<CourierSettlement[]> {
    return this.courierService.listSettlements();
  }

  @Get('settlements/:id')
  async getSettlement(@Param('id', ParseIntPipe) id: number): Promise<CourierSettlement> {
    return this.courierService.getSettlementById(id);
  }

  @Post('settlements')
  async createSettlement(
    @Body() body: CreateSettlementDto,
    @Req() req: any
  ): Promise<CourierSettlement> {
    return this.courierService.createSettlement(body, req.user);
  }
}

