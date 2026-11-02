import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { ProductsService, CreateProductDto } from './products.service';
import { Product } from '@ar-option/shared-types';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async listProducts(): Promise<Product[]> {
    return this.productsService.listProducts();
  }

  @Get(':id')
  async getProduct(@Param('id', ParseIntPipe) id: number): Promise<Product> {
    return this.productsService.getProductById(id);
  }

  @Post()
  async createProduct(@Body() body: CreateProductDto): Promise<Product> {
    return this.productsService.createProduct(body);
  }

  @Post('initial-stock')
  async addInitialStock(
    @Body()
    body: {
      variation_id: number;
      location_id: number;
      quantity: number;
    },
    @Req() req: any
  ): Promise<{ movement_id: string }> {
    return this.productsService.addInitialStock(
      body.variation_id,
      body.location_id,
      body.quantity,
      req.user?.id
    );
  }
}

