import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CursorDto } from '../paginacion/paginacion.dto';
import {
  CursorResultado,
  escaparLike,
  paginar,
  paginarPorCursor,
  PaginaResultado,
} from '../paginacion/paginar';
import { ActualizarLibroDto } from './dto/actualizar-libro.dto';
import { CampoOrdenLibro, ConsultaLibrosDto } from './dto/consulta-libros.dto';
import { CrearLibroDto } from './dto/crear-libro.dto';
import { Libro } from './entities/libro.entity';

const COLUMNAS_ORDEN: Record<CampoOrdenLibro, string> = {
  id: 'libro.id',
  titulo: 'libro.titulo',
  autor: 'libro.autor',
  anio: 'libro.anio',
  categoria: 'libro.categoria',
  disponibles: 'libro.disponibles',
};

@Injectable()
export class LibrosService {
  constructor(
    @InjectRepository(Libro) private readonly repo: Repository<Libro>,
  ) {}

  create(dto: CrearLibroDto): Promise<Libro> {
    return this.repo.save(this.repo.create({ ...dto, disponibles: dto.ejemplares }));
  }

  findAll(consulta: ConsultaLibrosDto): Promise<PaginaResultado<Libro>> {
    const qb = this.repo.createQueryBuilder('libro');

    if (consulta.categoria) {
      qb.andWhere('libro.categoria = :categoria', {
        categoria: consulta.categoria,
      });
    }
    if (consulta.anioDesde !== undefined) {
      qb.andWhere('libro.anio >= :anioDesde', {
        anioDesde: consulta.anioDesde,
      });
    }
    if (consulta.anioHasta !== undefined) {
      qb.andWhere('libro.anio <= :anioHasta', {
        anioHasta: consulta.anioHasta,
      });
    }
    if (consulta.buscar) {
      const patron = `%${escaparLike(consulta.buscar)}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("LOWER(libro.titulo) LIKE LOWER(:patron) ESCAPE '!'", {
              patron,
            })
            .orWhere("LOWER(libro.autor) LIKE LOWER(:patron) ESCAPE '!'", {
              patron,
            });
        }),
      );
    }

    return paginar(qb, 'libro', consulta, {
      columna: COLUMNAS_ORDEN[consulta.ordenarPor],
      direccion: consulta.direccion === 'desc' ? 'DESC' : 'ASC',
    });
  }

  listarPorCursor(consulta: CursorDto): Promise<CursorResultado<Libro>> {
    const qb = this.repo.createQueryBuilder('libro');
    return paginarPorCursor(qb, 'libro', 'titulo', consulta);
  }

  async findOne(id: number): Promise<Libro> {
    const libro = await this.repo.findOneBy({ id });
    if (!libro) throw new NotFoundException(`El libro ${id} no existe`);
    return libro;
  }

  async update(id: number, dto: ActualizarLibroDto): Promise<Libro> {
    const libro = await this.findOne(id);
    return this.repo.save(Object.assign(libro, dto));
  }

  async remove(id: number): Promise<void> {
    const { affected } = await this.repo.delete(id);
    if (!affected) throw new NotFoundException(`El libro ${id} no existe`);
  }

  // Suma (o resta, si es negativo) ejemplares disponibles
  async ajustarDisponibles(id: number, delta: number): Promise<Libro> {
    const libro = await this.findOne(id);
    libro.disponibles += delta;
    return this.repo.save(libro);
  }
}
