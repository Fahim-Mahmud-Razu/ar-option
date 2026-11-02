import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Put,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { ProductsService, CreateProductDto, UpdateProductDto } from './products.service';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { Product, Category, Brand } from '@ar-option/shared-types';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async listProducts(): Promise<Product[]> {
    return this.productsService.listProducts();
  }

  @Get('next-sku')
  async nextSku(): Promise<{ sku: string }> {
    return this.productsService.peekNextSku();
  }

  @Get('sku-available')
  async skuAvailable(@Query('code') code: string) {
    return this.productsService.skuAvailable(code);
  }

  @Get('categories')
  async listCategories(): Promise<Category[]> {
    return this.productsService.listCategories();
  }

  @Post('categories')
  @UseGuards(PermissionsGuard)
  @RequirePermission('products.manage')
  async createCategory(@Body() body: { name: string; parent_id?: number }): Promise<Category> {
    return this.productsService.createCategory(body.name, body.parent_id);
  }

  @Get('brands')
  async listBrands(): Promise<Brand[]> {
    return this.productsService.listBrands();
  }

  @Post('brands')
  @UseGuards(PermissionsGuard)
  @RequirePermission('products.manage')
  async createBrand(@Body() body: { name: string }): Promise<Brand> {
    return this.productsService.createBrand(body.name);
  }

  @Get(':id')
  async getProduct(@Param('id', ParseIntPipe) id: number): Promise<Product> {
    return this.productsService.getProductById(id);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission('products.manage')
  async createProduct(@Body() body: CreateProductDto, @Req() req: any): Promise<Product> {
    return this.productsService.createProduct(body, req.user?.id);
  }

  @Put(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('products.manage')
  async updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateProductDto,
    @Req() req: any
  ): Promise<Product> {
    return this.productsService.updateProduct(id, body, req.user?.id);
  }

  @Post('initial-stock')
  @UseGuards(PermissionsGuard)
  @RequirePermission('products.manage')
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

