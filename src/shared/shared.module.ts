import { Module, Global } from '@nestjs/common';
import { CryptoVaultService } from './crypto-vault.service';

@Global()
@Module({
  providers: [CryptoVaultService],
  exports: [CryptoVaultService],
})
export class SharedModule {}
