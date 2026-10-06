import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-info',
  imports: [RouterLink],
  templateUrl: './info.html',
  styleUrl: './info.css',
})
export class Info {
  readonly i18n = inject(LanguageService);
}
